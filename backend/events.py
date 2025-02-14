import asyncio
from collections import defaultdict
from datetime import datetime, timedelta
import functools
import socketio
import socketio.exceptions
import traceback
import database as db
import Ed25519
import notifications
import utils

dm_calls_map = defaultdict(dict)

# map from dm id -> username -> sched id -> (message, timestamp, handle)
scheduled_messages = defaultdict(lambda: defaultdict(dict))

def error_wrap(f):
    """
    Wraps async functions in a catch-all handler that returns False on any error.
    Ideally, this is a last resort and not relied on.
    """
    @functools.wraps(f)
    async def wrapper(*args, **kwargs):
        try:
            print(f"Calling {f.__name__} with data {args[2]}")
            ret = await f(*args, **kwargs)
        except ValueError:
            # This occurs from ed25519 and data parsing.
            # Still log it anyway.
            traceback.print_exc()
            ret = False, "Malformed data."
        except:
            # All other errors.
            # Make sure to report the error.
            traceback.print_exc()
            ret = False, "Internal server error."
        return {"success": ret[0], "result": ret[1]}
    return wrapper

def login_fail_wrap(f):
    """When a login function returns false, increment a fail counter."""
    @functools.wraps(f)
    async def wrapper(sio: socketio.AsyncServer, sid, data):
        delta = timedelta(seconds=60) # 60 second lockout timer.
        now = datetime.now()
        async with sio.session(sid) as session:
            # Check lockout
            if now - session["lockout_start"] < delta:
                # Still in lockout.
                print(f"Sid {sid} currently in lockout.")
                return False, "You have been locked out for 60 seconds."

        val = await f(sio, sid, data)

        if not val[0]:
            async with sio.session(sid) as session:
                session["login_fails"] += 1
                if session["login_fails"] >= 10:
                    session["lockout_start"] = now
                    return False, val[1] + " You have been locked out for 60 seconds."
                else:
                    # Append remaining tries to response message.
                    remaining = 10 - session["login_fails"]
                    return False, val[1] + f" {remaining} attempts left before lockout."
        return val
    return wrapper

def login_required_wrap(f):
    """Require the client to be logged in to proceed."""
    @functools.wraps(f)
    async def wrapper(sio: socketio.AsyncServer, sid, data):
        async with sio.session(sid) as session:
            if not session["logged_in"]:
                # Client not logged in.
                return False, "Not logged in."
        return await f(sio, sid, data)
    return wrapper

def check_keys(*keys):
    """Require specific keys when called."""
    def outer_wrapper(f):
        @functools.wraps(f)
        async def wrapper(sio: socketio.AsyncServer, sid, data):
            if not check_for_keys(data, *keys):
                return False, "Invalid data format."
            return await f(sio, sid, data)
        return wrapper
    return outer_wrapper

@error_wrap
@login_fail_wrap
@check_keys("username")
async def login(sio: socketio.AsyncServer, sid, data):
    username = data["username"]
    if not db.user_exists(username):
        # User does not exist.
        return False, "User does not exist."
    async with sio.session(sid) as session:
        if session["logged_in"]:
            # Client already logged in.
            return False, "Already logged in."
        pub = db.get_user(username)["public_key"]
        chal, resp = Ed25519.generate_challenge(pub)
        session["challenge_response"] = resp
        session["username"] = username
    return True, chal

@error_wrap
@login_fail_wrap
@check_keys("response")
async def login_challenge_response(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        if "challenge_response" not in session:
            # Not expecting a challenge response right now.
            return False, "Not expecting a challenge response right now."
        expected = session["challenge_response"]
        del session["challenge_response"] # Always delete to prevent repeated attempts.
        if expected != data["response"]:
            # Did not match expected response.
            return False, "Incorrect response."
        session["logged_in"] = True
        session["login_fails"] = 0
        username = session["username"]

    await notifications.login_join_rooms(sio, sid)
    # Notify of previous set status if it wasn't offline.
    user = db.get_user(username)
    if user["status"] != "offline":
        utils.start_background_task(notifications.notify_profile(sio, sid, user))
    return True, True

@error_wrap
@check_keys("username", "public_key", "spk", "sig", "own_storage")
async def register(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        if session["logged_in"]:
            # Client already logged in.
            return False, "Already logged in."
    username = data["username"]
    if db.user_exists(username):
        # User already exists.
        return False, "Username already exists."

    pub = data["public_key"]
    Ed25519.decompress_key(pub)

    # Check signature and key validity.
    spk = data["spk"]
    sig = data["sig"]
    Ed25519.verify(pub, spk, sig)
    Ed25519.decompress_key(spk)
    
    if not isinstance(data["own_storage"], str):
        return False, "Invalid data format."
    
    db.create_user(username, pub, spk, sig, data["own_storage"])
    return True, True

@error_wrap
@check_keys("username")
async def username_exists(sio: socketio.AsyncServer, sid, data):
    username = data["username"]
    return True, db.user_exists(username)

@error_wrap
@login_required_wrap
@check_keys("username")
async def get_user(sio: socketio.AsyncServer, sid, data):
    username = data["username"]
    if not db.user_exists(username):
        # Username does not exist.
        return False, "User does not exist."
    profile = utils.exclude_keys(db.get_user(username), ["id", "own_storage", "x3dh_requests"])

    if not notifications.is_user_online(username):
        # When no clients with that username are connected, always return offline.
        # When that user logs in their previously set status will be maintained.
        profile["status"] = "offline"

    return True, profile

@error_wrap
@login_required_wrap
@check_keys()
async def get_full_user(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    profile = utils.exclude_keys(db.get_user(username), ["id", "x3dh_requests"])
    return True, profile

@error_wrap
@login_required_wrap
@check_keys()
async def get_user_list(sio: socketio.AsyncServer, sid, data):
    return True, db.get_user_list()

@error_wrap
@login_required_wrap
async def set_user(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    parsed = utils.get_keys(data, ["spk", "sig", "status", "biography", "profile_picture", "own_storage"])

    if not parsed:
        return False, "Invalid data format."

    if "spk" in parsed:
        # Check signature and key validity.
        pub = db.get_user(username)["public_key"]
        spk = parsed["spk"]
        sig = parsed["sig"]
        Ed25519.verify(pub, spk, sig)
        Ed25519.decompress_key(spk)
    
    if "biography" in parsed:
        if not isinstance(parsed["biography"], str) or len(parsed["biography"]) > 500:
            return False, "Invalid data format."
    
    if "own_storage" in parsed:
        if not isinstance(parsed["own_storage"], str):
            return False, "Invalid data format."

    db.set_user_props(username, parsed)

    user = utils.exclude_keys(db.get_user(username), ["id", "own_storage", "x3dh_requests"])
    utils.start_background_task(notifications.notify_profile(sio, sid, user))
    return True, True

@error_wrap
@login_required_wrap
@check_keys("usernames", "messages", "key_tree")
async def create_dm(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        sender = session["username"]

    pairs = list(zip(data["usernames"], data["messages"]))
    for username, message in pairs:
        if not db.user_exists(username):
            # Username does not exist.
            return False, "User does not exist."

        spk = message["spk"]
        if spk != db.get_user(username)["spk"]:
            # SPK does not matched the one saved.
            return False, "SPK does not match."

        ek = message["ek"]
        # Verify key is valid.
        Ed25519.decompress_key(ek)

    if len(pairs) == 1 and db.dm_users_exists([sender, *data["usernames"]]):
        # If the individual dm exists already.
        return False, "DM with that user already exists."

    if len(pairs) == 1 and sender not in db.get_of_status(data["usernames"][0], "friend"):
        # Individual dm participants need to be friends.
        return False, "You need to be friends to make that DM."

    # Check key tree
    for k in data["key_tree"]:
        Ed25519.decompress_key(k)

    # Create the dm
    dm_id = db.create_dm([sender, *data["usernames"]], data["key_tree"])

    for i, (name, message) in enumerate(pairs, start=1):
        x3dh = {
            "sender": sender,
            "ik": db.get_user(sender)["public_key"],
            "spk": message["spk"],
            "ek": message["ek"],
            "key_tree": data["key_tree"],
            "position": i, # Position 0 is the sender.
            "id": dm_id
        }

        if notifications.is_user_online(name):
            # Online to be able to receive it.
            utils.start_background_task(notifications.notify_x3dh(sio, name, x3dh))
        else:
            # Offline so store it for later.
            db.append_x3dh(name, x3dh)

    await notifications.join_new_dm(sio, dm_id)

    return True, dm_id

@error_wrap
@login_required_wrap
@check_keys()
async def get_dms(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    return True, db.get_user_dms(username)

@error_wrap
@login_required_wrap
@check_keys("id")
async def get_dm(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    dm_id = int(data["id"])
    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    dm = db.get_dm(dm_id)
    dm["users_in_call"] = dm_calls_map[dm_id]

    # Gather the user's scheduled messages for this dm.
    scheduled = scheduled_messages[dm_id][username]
    s = {k: utils.exclude_keys(v, ["handle"]) for k,v in scheduled.items()}
    dm["scheduled_messages"] = s

    return True, dm

@error_wrap
@login_required_wrap
@check_keys("id", "name")
async def set_dm(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    dm_id = int(data["id"])
    parsed = utils.get_keys(data, ["name"])

    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    db.set_dm_props(dm_id, parsed)

    # Notification
    dm = utils.exclude_keys(db.get_dm(dm_id), ["latest_message"])
    dm["users_in_call"] = dm_calls_map[dm_id]
    utils.start_background_task(notifications.notify_dm(sio, dm))
    return True, True

@error_wrap
@login_required_wrap
@check_keys("id")
async def leave_dm(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    dm_id = int(data["id"])

    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    db.leave_dm(dm_id, username)
    await notifications.user_leave_dm(sio, username, dm_id)

    # Notification
    dm = utils.exclude_keys(db.get_dm(dm_id), ["latest_message"])
    dm["users_in_call"] = dm_calls_map[dm_id]
    utils.start_background_task(notifications.notify_dm(sio, dm))
    return True, True

@error_wrap
@login_required_wrap
@check_keys("id", "message", "signature", "schedule", "delete")
async def send_message(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    dm_id = int(data["id"])
    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    dm = db.get_dm(dm_id)
    if len(dm["users"]) == 2:
        friends = db.get_of_status(dm["users"][0], "friend")
        if dm["users"][1] not in friends:
            return False, "You need to be friends to send messages here."

    msg = data["message"]
    sig = data["signature"]
    pub = db.get_user(username)["public_key"]
    Ed25519.verify(pub, msg, sig)

    schedule = int(data["schedule"])
    delete = int(data["delete"])

    # Scheduled messages handling
    async def schedule_handler(sched_id):
        pre = max(schedule - 60, 0) # Clamp to zero.
        post = schedule - pre
        if pre > 0:
            await asyncio.sleep(pre)
            await notifications.notify_sched_soon(sio, username, dm_id, sched_id)
        await asyncio.sleep(post)

        # No longer scheduled so clean up the scheduled entries.
        del scheduled_messages[dm_id][username][sched_id]

        m = db.create_message(dm_id, username, msg, sig, delete)

        # Tell the user their message got sent. Also do regular message notifications.
        await notifications.notify_sched_message(sio, username, dm_id, sched_id)
        await notifications.notify_message(sio, dm_id, m)

        if delete > 0:
            # Wait for delete (if it was set to delete).
            await asyncio.sleep(delete)
            db.delete_message(m["id"])
            await notifications.notify_message_delete(sio, dm_id, m["id"])

    if schedule > 0:
        # This task also handles self destructs.
        sched_id = max(scheduled_messages[dm_id][username], default=0) + 1
        handle = utils.start_background_task(schedule_handler(sched_id))
        timestamp = utils.now_delta(schedule)
        scheduled_messages[dm_id][username][sched_id] = {
            "message": msg, "signature": sig, "timestamp": timestamp, "handle": handle
        }
        return True, True

    # Notification
    m = db.create_message(dm_id, username, msg, sig, delete)
    utils.start_background_task(notifications.notify_message(sio, dm_id, m))

    # Self destruct message handling
    async def delete_handler():
        await asyncio.sleep(delete)
        db.delete_message(m["id"])
        await notifications.notify_message_delete(sio, dm_id, m["id"])

    if delete > 0:
        # Only apply deleter when scheduler didn't start and we need to delete.
        utils.start_background_task(delete_handler())
    return True, True

@error_wrap
@login_required_wrap
@check_keys("id")
async def get_message(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    m_id = int(data["id"])

    if not db.message_exists(m_id) or not db.message_in_user_dm(m_id, username):
        # Message doesn't exist or user can't see it.
        return False, "You do not have access to that Message."

    return True, db.get_message(m_id)

@error_wrap
@login_required_wrap
@check_keys("id", "cursor", "limit")
async def get_message_history(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    dm_id = int(data["id"])
    # Just check it is a timestamp.
    _ = datetime.strptime(data["cursor"], "%Y-%m-%dT%H:%M:%S.%f%z")
    limit = int(data["limit"])

    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    return True, db.get_messages(dm_id, data["cursor"], limit)

@error_wrap
@login_required_wrap
@check_keys("id")
async def get_pinned(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    
    dm_id = int(data["id"])
    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    return True, db.get_pinned_messages(dm_id)

@error_wrap
@login_required_wrap
async def set_message(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    m_id = int(data["id"])
    parsed = utils.get_keys(data, ["message", "signature", "pinned"])

    if not db.message_exists(m_id) or not db.message_in_user_dm(m_id, username):
        # Message doesn't exist or not a part of the user's dms.
        return False, "You do not have access to that message."

    if "message" in parsed:
        if db.get_message(m_id)["sender"] != username:
            return False, "You cannot edit that message."
        msg = parsed["message"]
        sig = parsed["signature"]
        pub = db.get_user(username)["public_key"]
        Ed25519.verify(pub, msg, sig)

    db.set_message_props(m_id, parsed)

    # Notification
    m = db.get_message(m_id)
    dm_id = m["dm_id"]
    utils.start_background_task(notifications.notify_message_change(sio, dm_id, m))
    return True, True

@error_wrap
@login_required_wrap
@check_keys("dm_id", "schedule_id")
async def cancel_scheduled_message(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    dm_id = int(data["dm_id"])
    schedule_id = int(data["schedule_id"])

    scheduled = scheduled_messages[dm_id][username]
    if schedule_id not in scheduled:
        return False, "You did not schedule a message with that id."

    # This should cleanly cancel the task.
    scheduled[schedule_id]["handle"].cancel()
    del scheduled[schedule_id]

    return True, True

@error_wrap
@login_required_wrap
@check_keys("id", "reaction", "signature")
async def add_reaction(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    m_id = int(data["id"])
    if not db.message_exists(m_id) or not db.message_in_user_dm(m_id, username):
        # Message doesn't exist or not a part of the user's dms.
        return False, "You do not have access to that message."

    reaction = data["reaction"]
    sig = data["signature"]
    pub = db.get_user(username)["public_key"]
    Ed25519.verify(pub, reaction, sig)

    reaction_id = db.create_reaction(m_id, username, reaction, sig)

    # Notification
    m = db.get_message(m_id)
    dm_id = m["dm_id"]
    utils.start_background_task(notifications.notify_message_change(sio, dm_id, m))
    return True, reaction_id

@error_wrap
@login_required_wrap
@check_keys("id")
async def remove_reaction(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    reaction_id = int(data["id"])
    if not db.reaction_exists(reaction_id) or db.get_reaction(reaction_id)["sender"] != username:
        # Reaction doesn't exist or wasn't by this user.
        return False, "You do not have access to that reaction."

    m_id = db.delete_reaction(reaction_id)

    # Notification
    m = db.get_message(m_id)
    dm_id = m["dm_id"]
    utils.start_background_task(notifications.notify_message_change(sio, dm_id, m))
    return True, True

@error_wrap
@login_required_wrap
@check_keys("id")
async def ping_typing(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    dm_id = data["id"]
    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    users = db.get_dm(dm_id)["users"]

    if len(users) == 2 and users[1] not in db.get_of_status(users[0], "friend"):
        # Individual DM users need to be friends.
        return False, "You need to be friends to send messages here."

    # Notification
    utils.start_background_task(notifications.notify_typing(sio, sid, username, dm_id))
    return True, True

@error_wrap
@login_required_wrap
@check_keys("username")
async def send_friend_request(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        sender = session["username"]
    username = data["username"]

    # False if friending self, blocked by target, already friends or already requested.
    if sender == username:
        return False, "You cannot friend yourself."

    if not db.user_exists(username) or db.is_relation(username, sender, "block"):
        return False, "Could not friend that person."

    if username in db.get_of_status(sender, "friend"):
        return False, "You are already friends."

    if db.is_relation(sender, username, "request"):
        return False, "You have already sent a request."

    if db.is_relation(username, sender, "request"):
        return False, "That user has already sent a request to you."

    # Unblock if applicable.
    if db.is_relation(sender, username, "block"):
        db.delete_relation(sender, username)
    db.create_relation(sender, username, "request")

    # Notification
    utils.start_background_task(notifications.notify_friend_request(sio, sender, username))
    return True, True

@error_wrap
@login_required_wrap
@check_keys()
async def get_friend_requests(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    return True, db.get_incoming_of_status(username, "request")

@error_wrap
@login_required_wrap
@check_keys()
async def get_outgoing_requests(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]

    return True, db.get_outgoing_of_status(username, "request")

@error_wrap
@login_required_wrap
@check_keys("username", "accept")
async def ack_friend_request(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    sender = data["username"]
    accept = bool(data["accept"])

    # False if no request or already friends.
    if not db.user_exists(sender) or not db.is_relation(sender, username, "request"):
        return False, "That user did not send you a request."

    if username in db.get_of_status(sender, "friend"):
        return False, "You are already friends."

    if accept:
        db.set_relation_props(sender, username, {"status_code": "friend"})
        # Unblock if applicable.
        if db.is_relation(username, sender, "block"):
            db.delete_relation(username, sender)
    else:
        db.delete_relation(sender, username)

    # Notification
    utils.start_background_task(notifications.notify_friend_accept_request(sio, sender, username, accept))
    return True, True

@error_wrap
@login_required_wrap
@check_keys("username")
async def unfriend(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    other = data["username"]
    if not db.user_exists(other) or other not in db.get_of_status(username, "friend"):
        return False, "You are not friends with that user."

    utils.unfriend(username, other)
    utils.start_background_task(notifications.notify_friend_unfriend(sio, username, other))
    return True, True

@error_wrap
@login_required_wrap
@check_keys()
async def get_friends(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    return True, db.get_of_status(username, "friend")

@error_wrap
@login_required_wrap
@check_keys("username")
async def block_user(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        sender = session["username"]
    username = data["username"]

    # False if no such user or already blocked.
    if not db.user_exists(sender) or db.is_relation(sender, username, "block"):
        return False, "You cannot block that user."

    # Automatically unfriend if they were friends.
    if username in db.get_of_status(sender, "friend"):
        utils.unfriend(sender, username)

    # Automatically retract friendship request if present.
    if db.is_relation(sender, username, "request"):
        db.delete_relation(sender, username)

    db.create_relation(sender, username, "block")
    return True, True

@error_wrap
@login_required_wrap
@check_keys("username")
async def unblock_user(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        sender = session["username"]
    username = data["username"]

    # False if no such user or not blocked.
    if not db.user_exists(sender) or not db.is_relation(sender, username, "block"):
        return False, "You cannot unblock that user."

    db.delete_relation(sender, username)
    return True, True

@error_wrap
@login_required_wrap
@check_keys()
async def get_blocked(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    return True, db.get_outgoing_of_status(username, "block")

@error_wrap
@login_required_wrap
@check_keys("id", "uuid")
async def join_call(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    dm_id = int(data["id"])
    uuid = str(data["uuid"])

    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    dm_calls_map[dm_id][username] = uuid

    # Notification
    dm = db.get_dm(dm_id)
    dm["users_in_call"] = dm_calls_map[dm_id]
    utils.start_background_task(notifications.notify_dm(sio, dm))
    return True, dm_calls_map[dm_id]

@error_wrap
@login_required_wrap
@check_keys("id")
async def leave_call(sio: socketio.AsyncServer, sid, data):
    async with sio.session(sid) as session:
        username = session["username"]
    dm_id = int(data["id"])

    if not db.dm_exists(dm_id) or not db.user_in_dm(username, dm_id):
        # DM doesn't exist or user isn't a part of the dm.
        return False, "You do not have access to that DM."

    if username not in dm_calls_map[dm_id]:
        return False, "You are not part of the call."

    del dm_calls_map[dm_id][username]

    # Notification
    dm = db.get_dm(dm_id)
    dm["users_in_call"] = dm_calls_map[dm_id]
    utils.start_background_task(notifications.notify_dm(sio, dm))
    return True, True

def check_for_keys(data, *keys):
    """Tests for exact key existence in a dict."""
    if not isinstance(data, dict):
        return False
    return set(data) == set(keys)

def register_events(sio: socketio.AsyncServer):
    sio.on("login", functools.partial(login, sio))
    sio.on("login_challenge_response", functools.partial(login_challenge_response, sio))
    sio.on("register", functools.partial(register, sio))

    sio.on("username_exists", functools.partial(username_exists, sio))
    sio.on("get_user", functools.partial(get_user, sio))
    sio.on("get_full_user", functools.partial(get_full_user, sio))
    sio.on("get_user_list", functools.partial(get_user_list, sio))
    sio.on("set_user", functools.partial(set_user, sio))

    sio.on("create_dm", functools.partial(create_dm, sio))
    sio.on("get_dms", functools.partial(get_dms, sio))
    sio.on("get_dm", functools.partial(get_dm, sio))
    sio.on("set_dm", functools.partial(set_dm, sio))
    sio.on("leave_dm", functools.partial(leave_dm, sio))

    sio.on("send_message", functools.partial(send_message, sio))
    sio.on("get_message", functools.partial(get_message, sio))
    sio.on("get_message_history", functools.partial(get_message_history, sio))
    sio.on("get_pinned", functools.partial(get_pinned, sio))
    sio.on("set_message", functools.partial(set_message, sio))
    sio.on("cancel_scheduled_message", functools.partial(cancel_scheduled_message, sio))

    sio.on("add_reaction", functools.partial(add_reaction, sio))
    sio.on("remove_reaction", functools.partial(remove_reaction, sio))

    sio.on("ping_typing", functools.partial(ping_typing, sio))

    sio.on("send_friend_request", functools.partial(send_friend_request, sio))
    sio.on("get_friend_requests", functools.partial(get_friend_requests, sio))
    sio.on("get_outgoing_requests", functools.partial(get_outgoing_requests, sio))
    sio.on("ack_friend_request", functools.partial(ack_friend_request, sio))
    sio.on("unfriend", functools.partial(unfriend, sio))
    sio.on("get_friends", functools.partial(get_friends, sio))

    sio.on("block_user", functools.partial(block_user, sio))
    sio.on("unblock_user", functools.partial(unblock_user, sio))
    sio.on("get_blocked", functools.partial(get_blocked, sio))

    sio.on("join_call", functools.partial(join_call, sio))
    sio.on("leave_call", functools.partial(leave_call, sio))
