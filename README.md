# GITHUB 
This was a group project done during university. My contributions are the entire backend and the cryptography for the frontend.

The original readme is below.

# Unmanageable - End-to-End Encrypted Messaging

## Docker Compose Setup (Recommended)
1. Ensure Docker Compose is installed (`docker compose version` or `docker-compose version`). If not, install it via Docker Desktop: https://docs.docker.com/compose/install/#scenario-one-install-docker-desktop
2. `cd` into the root of the repository.
3. Run `sudo docker compose up -d`.
4. Once you regain control of your terminal and all containers have `Started`, open https://localhost:8080 in your browser.
5. To stop hosting the project, run `sudo docker compose down`.

## Lubuntu Virtual Machine Setup (Not Recommended)
### VM Setup
Make sure that the resolution of the VM can be set to something modern like 1920x1080.
If this is impossible, please zoom out on the webpage (67% zoom has been tested to work
with a vm resolution of 800x600) to fit all content.

### Environment Setup
Run the following commands in order (assumed from a fresh vm):
1. `sudo apt update`
2. `sudo apt install --reinstall ca-certificates`
3. `sudo apt install curl python3-pip`
4. `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -`
5. `sudo apt install nodejs`
6. `sudo apt install --only-upgrade firefox`
7. `cd` into the root of the repository.

### Backend Setup & Run
Run the following commands in order:
1. `cd backend`
2. `pip3 install -r requirements.txt`

And to run the server.
3. `python3 main.py`

### Frontend Setup & Run
Run the following commands in order:
1. `cd frontend`
2. `npm i`
3. `npm run build`
4. `npm run preview`
