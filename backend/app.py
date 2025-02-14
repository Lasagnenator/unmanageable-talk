from datetime import datetime
from random import randint
import socketio
import events
import notifications
import database as db
import utils

# Stuck with `*` for CORS.
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins='*', logger=True)
events.register_events(sio)

@sio.event
async def connect(sid, environ, auth):
    print("connect ", sid, auth)
    
    async with sio.session(sid) as session:
        # Init their logged in status to False
        session["logged_in"] = False
        # Login fails and lockout.
        session["login_fails"] = 0
        session["lockout_start"] = datetime(1,1,1)

@sio.event
async def disconnect(sid):
    print("disconnect ", sid)

    # Cleanup notifications for this connection.
    await notifications.remove_sid(sio, sid)

    async with sio.session(sid) as session:
        if not session["logged_in"]:
            return
        # When they disconnect notify others of being offline now.
        username = session["username"]
        user = db.get_user(username)
        if user["status"] != "offline" and not notifications.is_user_online(username):
            user["status"] = "offline"
            await notifications.notify_profile(sio, sid, user)

        for dm_id, call in events.dm_calls_map.items():
            if username in call:
                del events.dm_calls_map[dm_id][username]

                dm = db.get_dm(dm_id)
                dm["users_in_call"] = list(events.dm_calls_map[dm_id].keys())
                utils.start_background_task(notifications.notify_dm(sio, dm))
