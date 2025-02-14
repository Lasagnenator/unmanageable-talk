import socketio
import uvicorn
from app import sio

app = socketio.ASGIApp(sio)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=5000, log_level="info")
