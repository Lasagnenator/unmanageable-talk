import utils
import database as db
from socketio import AsyncServer
from collections import defaultdict

user_room = "ROOM_USER_{}"
dm_room = "ROOM_DM_{}_NOTIFICATION"
name_map = defaultdict(set)

async def login_join_rooms(sio: AsyncServer, sid):
    """Make this user join all the rooms for dm notifications at login time."""
    async with sio.session(sid) as session:
        username = session["username"]
        name_map[username].add(sid)
    dms = db.get_user_dms(username)
    for dm_id in dms:
        sio.enter_room(sid, dm_room.format(dm_id))
    sio.enter_room(sid, user_room.format(username))

    # Send any pending x3dh notifications 5 seconds after connect time.
    for notif in db.get_and_clear_x3dh(username):
        task = utils.delay_task(5.0, notify_x3dh(sio, username, notif))
        utils.start_background_task(task)

async def join_new_dm(sio: AsyncServer, dm_id: int):
    """Update users to be joined for a new dm. Should only be called
    after a new dm is made."""
    dm = db.get_dm(dm_id)
    for username in dm["users"]:
        for sid in name_map[username]:
            sio.enter_room(sid, dm_room.format(dm_id))

async def remove_sid(sio: AsyncServer, sid):
    """Remove an sid for notifications. Should only be called on disconnect."""
    async with sio.session(sid) as session:
        if not session["logged_in"]:
            return
        username = session["username"]
        name_map[username].remove(sid)

    for room in sio.rooms(sid):
        sio.leave_room(sid, room)
    sio.leave_room(sid, user_room.format(username))

async def user_leave_dm(sio: AsyncServer, username: str, dm_id: int):
    """Remove user from the specified dm notifications."""
    for sid in name_map[username]:
        sio.leave_room(sid, dm_room.format(dm_id))

async def notify_profile(sio: AsyncServer, sid, user: dict):
    """Notify everyone except the user about a profile update."""
    await sio.emit("profile_notification", user, skip_sid=sid)

async def notify_dm(sio: AsyncServer, dm: dict):
    """Notify all users in a dm that it has changed."""
    dm_id = dm["id"]
    await sio.emit("dm_notification", dm, to=dm_room.format(dm_id))

async def notify_typing(sio: AsyncServer, sid, username: str, dm_id: int):
    """Notify users in a dm of a typing ping event."""
    payload = {
        "id": dm_id,
        "username": username
    }
    await sio.emit("typing_notification", payload, to=dm_room.format(dm_id), skip_sid=sid)

async def notify_message(sio: AsyncServer, dm_id: int, message: dict):
    """Notify all users a part of this dm with the latest message."""
    await sio.emit("message_notification", message, to=dm_room.format(dm_id))

async def notify_message_change(sio: AsyncServer, dm_id: int, message: dict):
    """Notify all users a part of this dm with the changed message."""
    await sio.emit("message_change_notification", message, to=dm_room.format(dm_id))

async def notify_message_delete(sio: AsyncServer, dm_id: int, payload):
    """Notify all users a part of this dm with the deleted message."""
    await sio.emit("message_delete_notification", payload, to=dm_room.format(dm_id))

async def notify_sched_message(sio: AsyncServer, username: str, dm_id, schedule_id):
    """Notify user their scheduled message got sent."""
    payload = {
        "dm_id": dm_id,
        "schedule_id": schedule_id
    }
    await sio.emit("scheduled_message_sent_notification", payload, to=user_room.format(username))

async def notify_sched_soon(sio: AsyncServer, username: str, dm_id, schedule_id):
    """Notify user their scheduled message will be sent shortly."""
    payload = {
        "dm_id": dm_id,
        "schedule_id": schedule_id
    }
    await sio.emit("scheduled_soon_notification", payload, to=user_room.format(username))

async def notify_x3dh(sio: AsyncServer, username: str, payload):
    """Send X3DH notification to the username.
    Should be called when a new request is made."""
    await sio.emit("x3dh_notification", payload, to=user_room.format(username))

async def notify_friend_request(sio: AsyncServer, sender: str, username: str):
    """Notify user of a new friend request."""
    payload = {
        "username": sender
    }
    await sio.emit("friend_request_notification", payload, to=user_room.format(username))

async def notify_friend_accept_request(sio: AsyncServer, sender: str, username: str, accept: bool):
    """Notify user of acceptance of their friend request."""
    payload = {
        "username": username,
        "accept": accept
    }
    await sio.emit("friend_request_accept_notification", payload, to=user_room.format(sender))

async def notify_friend_unfriend(sio: AsyncServer, u1: str, u2: str):
    """Notify user of an unfriend."""
    payloads = [{"username": u1}, {"username": u2}]
    await sio.emit("unfriend_notification", payloads[0], to=user_room.format(u2))
    await sio.emit("unfriend_notification", payloads[1], to=user_room.format(u1))

def is_user_online(username: str):
    return len(name_map[username]) > 0
