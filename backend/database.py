from collections import defaultdict
from datetime import datetime
from functools import wraps
import json
from peewee import * # type: ignore - importing all from peewee is fine.
from playhouse.shortcuts import model_to_dict, update_model_from_dict
from typing import Literal, Union
import utils

# Low level SQL calls logging
import logging
logger = logging.getLogger("peewee")
logger.addHandler(logging.StreamHandler())
# logger.setLevel(logging.DEBUG)

status_type = Union[Literal['block'], Literal['friend'], Literal['request']]

# in memory database
db = SqliteDatabase(":memory:", pragmas={
    "foreign_keys": 1
})

class BaseModel(Model):
    # id field not specified because peewee adds one for us.
    class Meta:
        database = db

class User(BaseModel):
    username = CharField(unique=True, index=True)
    public_key = FixedCharField(64) # 32 bytes
    spk = FixedCharField(64, null=True) # 32 bytes
    sig = FixedCharField(128, null=True) # sig(spk)
    status = CharField(default=lambda: "online")
    biography = FixedCharField(500, default=lambda: "")
    profile_picture = CharField(default=lambda: "")
    own_storage = CharField(default=lambda: "")
    x3dh_requests = CharField(default=lambda: "[]")

class Relation(BaseModel):
    from_user = ForeignKeyField(User, backref="outgoing_relations")
    to_user = ForeignKeyField(User, backref="incoming_relations")
    # Friends are bidirectional. Requests are unidirectional.
    # Blocks are applied bidirectionally but exist as unidirectional relations.
    # i.e. you can block someone who already blocked you. Then nothing changes
    # even when one user decides to unblock the other.
    status_code = CharField() # {"request", "friend", "block"}
    class Meta:
        primary_key = CompositeKey("from_user", "to_user")
        # Peewee changes the name internally.
        constraints = [Check("from_user_id <> to_user_id")]

class DM(BaseModel):
    users = ManyToManyField(User, backref="dms")
    public_keys = CharField() # Concat of public key tree as array
    name = CharField(null=True)
    created_at = DateTimeField()

class Message(BaseModel):
    dm = ForeignKeyField(DM, backref="messages")
    sender = ForeignKeyField(User, backref="+")
    message = CharField() # Encrypted
    signature = FixedCharField(128) # sig(encrypted message)
    timestamp = DateTimeField(index=True)
    delete_timestamp = DateTimeField(null=True)
    pinned = BooleanField(default=False)

class Reaction(BaseModel):
    message = ForeignKeyField(Message, backref="reactions")
    sender = ForeignKeyField(User, backref="+")
    reaction = CharField() # Encrypted
    signature = FixedCharField(128) # sig(encrypted reaction)

# Initalisation of the database.
UserDM = DM.users.get_through_model()
db.create_tables([
    User,
    Relation,
    DM,
    Message,
    Reaction,
    UserDM
])

def atomic_wrapper(f):
    """Makes everything in this function call atomic."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        with db.atomic():
            return f(*args, **kwargs)
    return wrapper

# All the below functions assume checks on input have already taken place.


#### USER FUNCTIONS ###

@atomic_wrapper
def create_user(username: str, public_key: str, spk: str, sig: str, own_storage: str):
    """Create the user."""
    User.create(username=username, public_key=public_key, spk=spk, sig=sig, own_storage=own_storage)

@atomic_wrapper
def get_user(username: str):
    """Get everything about the user as a dictionary."""
    u = User.get(User.username == username)
    return model_to_dict(u)

@atomic_wrapper
def get_user_list():
    """Get a list of all users. Excludes own storage and x3dh requests."""
    exclude = [User.own_storage, User.x3dh_requests]
    return [model_to_dict(u, exclude=exclude) for u in User.select()]

@atomic_wrapper
def set_user_props(username: str, props):
    """Update the user's information from the given dictionary."""
    u = User.get(User.username == username)
    update_model_from_dict(u, props)
    u.save()


### DM FUNCTIONS ###

@atomic_wrapper
def create_dm(usernames: "list[str]", public_keys: "list[str]"):
    """Create a DM of all usernames and the specified flattened key tree.
    Returns the new dm id."""
    key_tree = json.dumps(public_keys)
    d = DM.create(public_keys=key_tree, created_at=utils.now())
    users = User.select().where(User.username.in_(usernames))
    d.users.add(users)
    d.save()
    return d.id

@atomic_wrapper
def get_dm(dm_id: int):
    """Get the information for the specified dm. This includes the user list and latest message."""
    q = DM.select(DM, User.username).join(UserDM).join(User).where(UserDM.dm_id == dm_id)
    d = model_to_dict(q[0])
    d["users"] = [dm.dmuserthrough.user.username for dm in q]

    # Get latest message.
    m2 = Message.alias()
    u2 = User.alias()
    data = (Message.select(Message, User.username, Reaction, u2.username)
            .join(User)
            .switch(Message)
            .join(Reaction, JOIN.LEFT_OUTER)
            .join(u2, JOIN.LEFT_OUTER)
            .where((Message.timestamp == m2.select(fn.MAX(m2.timestamp)).where(m2.dm == Message.dm))
                   & (Message.dm == dm_id))
            )

    if len(data) == 0:
        d["latest_message"] = None
    else:
        d["latest_message"] = model_to_dict(data[0], recurse=False)
        d["latest_message"]["sender"] = data[0].sender.username
        # This is omega cursed because peewee doesn't give a nicer way to handle this case.
        if hasattr(data[0], "reaction"):
            d["latest_message"]["reactions"] = [reaction_to_dict(m.reaction) for m in data]
        else:
            d["latest_message"]["reactions"] =[]

    return d

@atomic_wrapper
def get_user_dms(username: str):
    """Get a list of dms ids that this user is a part of."""
    q = (User.select(DM)
         .join(UserDM)
         .join(DM)
         .where((User.username == username)))

    return [u.dmuserthrough.dm.id for u in q]

@atomic_wrapper
def set_dm_props(dm_id: int, props):
    """Update the dm's information. Only use right now is for the name of the dm."""
    d = DM.get_by_id(dm_id)
    update_model_from_dict(d, props)
    d.save()

@atomic_wrapper
def leave_dm(dm_id: int, username: str):
    """Remove a user from the dm."""
    u = User.get(User.username == username)
    UserDM.delete().where((UserDM.user == u.id) & (UserDM.dm == dm_id)).execute()


### MESSAGE FUNCTIONS ###

@atomic_wrapper
def create_message(dm_id: int, username: str, message: str, sig: str, d_time = 0):
    """Add a message into the database with specified time. Returns the dict for it."""
    sender = User.get(User.username == username)
    time = utils.now()
    if d_time <= 0:
        d_time = None
    else:
        d_time = utils.now_delta(d_time)

    m = Message.create(dm=dm_id, sender=sender, message=message, signature=sig, timestamp=time, delete_timestamp=d_time)
    model = model_to_dict(m, recurse=False)
    model["dm_id"] = model.pop("dm")
    model["reactions"] = []
    model["sender"] = username
    return model

@atomic_wrapper
def get_message(m_id):
    """Get a single message."""
    User2 = User.alias()
    query = (Message.select(Message, User.username, Reaction, User2.username)
             .join(User)
             .switch(Message)
             .join(Reaction, JOIN.LEFT_OUTER)
             .join(User2, JOIN.LEFT_OUTER)
             .where(Message.id == m_id)) # type: ignore - Message.id exists

    model = model_to_dict(query[0], recurse=False)
    model["sender"] = query[0].sender.username
    model["dm_id"] = model.pop("dm")
    if hasattr(query[0], "reaction"):
        model["reactions"] = [reaction_to_dict(m.reaction) for m in query]
    else:
        model["reactions"] = []

    return model

@atomic_wrapper
def get_messages(dm_id: int, cursor: datetime, count: int):
    """Get messages for a specific dm. cursor and count are used for pagination.
    Returned messages are in order starting from most recent."""
    m_query = (Message.select(Message, User.username)
             .join(User)
             .where((Message.dm == dm_id) &
                    (Message.timestamp < cursor))
             .order_by(Message.timestamp.desc())
             .limit(count))

    if len(m_query) == 0:
        return []

    # Query results are cached so m_query doesn't generate new SQL queries.
    start = m_query[-1].timestamp

    r_query = (Reaction.select(Reaction, Message, User.username)
               .join(Message)
               .switch(Reaction)
               .join(User)
               .where(
                    (Message.dm == dm_id)
                    & (Message.timestamp >= start)
                    & (Message.timestamp < cursor)))

    reaction_map = defaultdict(list)
    for reaction in r_query:
        reaction_map[reaction.message.id].append(reaction_to_dict(reaction))

    ret = []
    for message in m_query:
        m = model_to_dict(message, recurse=False)
        m["sender"] = message.sender.username
        m["dm_id"] = m.pop("dm")
        m["reactions"] = reaction_map[m["id"]]
        ret.append(m)

    return ret

@atomic_wrapper
def get_pinned_messages(dm_id: int):
    """Get messages for a specific dm. cursor and count are used for pagination.
    Returned messages are in order starting from most recent."""
    m_query = (Message.select(Message, User.username)
             .join(User)
             .where((Message.dm == dm_id) &
                    (Message.pinned == True))
             .order_by(Message.timestamp.desc()))

    if len(m_query) == 0:
        return []

    r_query = (Reaction.select(Reaction, Message, User.username)
               .join(Message)
               .switch(Reaction)
               .join(User)
               .where((Message.dm == dm_id) & (Message.pinned == True)))

    reaction_map = defaultdict(list)
    for reaction in r_query:
        reaction_map[reaction.message.id].append(reaction_to_dict(reaction))

    ret = []
    for message in m_query:
        m = model_to_dict(message, recurse=False)
        m["sender"] = message.sender.username
        m["dm_id"] = m.pop("dm")
        m["reactions"] = reaction_map[m["id"]]
        ret.append(m)

    return ret

@atomic_wrapper
def set_message_props(m_id: int, props):
    """Update the message's information. Used for edits and pins."""
    d = Message.get_by_id(m_id)
    update_model_from_dict(d, props)
    d.save()

@atomic_wrapper
def delete_message(m_id: int):
    """Delete a message."""
    Reaction.delete().where(Reaction.message == m_id).execute()
    Message.delete_by_id(m_id)


### REACTION FUNCTIONS ###

@atomic_wrapper
def create_reaction(message_id: int, username: str, reaction: str, sig: str):
    """Add a reaction into the database."""
    sender = User.get(User.username == username)
    r = Reaction.create(message=message_id, sender=sender, reaction=reaction, signature=sig)
    return r.id

def get_reaction(reaction_id: int):
    """Get the information for a single reaction."""
    query = (Reaction.select(Reaction, User.username)
             .join(User)
             .where(Reaction.id == reaction_id)) # type: ignore
    return reaction_to_dict(query.get())

@atomic_wrapper
def get_reactions(message_id: int):
    """Get reactions for a specific message.
    Returned reactions are given in any order."""
    query = (Reaction.select(Reaction, User.username)
             .join(User)
             .where(Reaction.message == message_id))
    return [reaction_to_dict(r) for r in query]

@atomic_wrapper
def delete_reaction(reaction_id: int):
    """Delete a reaction object. Returns the message id it came from."""
    r = Reaction.get_by_id(reaction_id)
    r.delete_instance()
    return r.message_id


### RELATION FUNCTIONS ###

@atomic_wrapper
def create_relation(username1: str, username2: str, status: status_type):
    """Create a relation from one user to the other."""
    user1 = User.get(User.username == username1)
    user2 = User.get(User.username == username2)
    Relation.create(from_user=user1, to_user=user2, status_code=status)

@atomic_wrapper
def set_relation_props(username1: str, username2: str, props):
    """Updates the relation (directional) with the props. Currently only used
    for changing status."""
    User2 = User.alias()
    r = (Relation.select()
         .join(User, on=Relation.from_user)
         .switch(Relation)
         .join(User2, on=Relation.to_user)
         .where((User.username == username1) & (User2.username == username2))
         ).get()
    update_model_from_dict(r, props)
    r.save()

@atomic_wrapper
def delete_relation(username1: str, username2: str):
    """Delete a relation from user1 to user2. Purpose is for unfriending,
    denying friend req or unblock."""
    User2 = User.alias()
    r = (Relation.select()
         .join(User, on=Relation.from_user)
         .switch(Relation)
         .join(User2, on=Relation.to_user)
         .where((User.username == username1) & (User2.username == username2))
         ).get()
    r.delete_instance()

@atomic_wrapper
def is_relation(username1: str, username2: str, status: status_type):
    """Determine if two users have such a status from u1 to u2."""
    User2 = User.alias()
    c = (Relation.select()
         .join(User, on=Relation.from_user)
         .switch(Relation)
         .join(User2, on=Relation.to_user)
         .where((User.username == username1) & (User2.username == username2)
                & (Relation.status_code == status))
         ).count()
    return c != 0

@atomic_wrapper
def get_outgoing_of_status(username: str, status: status_type):
    """Get a list of usernames with the given status outgoing."""
    user = User.get(User.username == username)
    query = (
        User.select(User.username)
        .join(Relation, on=Relation.to_user)
        .where((Relation.from_user == user) & (Relation.status_code == status))
    )
    return [u.username for u in query]

@atomic_wrapper
def get_incoming_of_status(username: str, status: status_type):
    """Get a list of usernames with the given status incoming."""
    user = User.get(User.username == username)
    query = (
        User.select(User.username)
        .join(Relation, on=Relation.from_user)
        .where((Relation.to_user == user) & (Relation.status_code == status))
    )
    return [u.username for u in query]

@atomic_wrapper
def get_of_status(username: str, status: status_type):
    """Get a list of usernames where there is a relation of the given status involving the
    given username (bidirectional)."""
    Relation2 = Relation.alias()
    User2 = User.alias()
    User3 = User.alias()

    query = (
        User.select(User.username)
        .join(Relation, JOIN.LEFT_OUTER, on=Relation.from_user)
        .join(User2, JOIN.LEFT_OUTER, on=Relation.to_user)
        .switch(User)
        .join(Relation2, JOIN.LEFT_OUTER, on=Relation2.to_user)
        .join(User3, JOIN.LEFT_OUTER, on=Relation2.from_user)
        .where(
            ((User2.username == username) & (Relation.status_code == status)) # to us.
            | ((User3.username == username) & (Relation2.status_code == status)) # from us.
        )
    )

    return [u.username for u in query]


### OTHER FUNCTIONS ###

@atomic_wrapper
def append_x3dh(username: str, payload: dict):
    """Append a X3DH payload to the target's inbox."""
    u = User.get(User.username == username)
    curr = json.loads(u.x3dh_requests)
    curr.append(payload)
    u.x3dh_requests = json.dumps(curr)
    u.save()

@atomic_wrapper
def get_and_clear_x3dh(username: str):
    """Get this user's X3DH payload list. Then clears the list."""
    u = User.get(User.username == username)
    l = json.loads(u.x3dh_requests)
    u.x3dh_requests = "[]"
    u.save()
    return l

def reaction_to_dict(reaction):
    """Convert a reaction to a dict."""
    fields = [Reaction.id, Reaction.reaction, Reaction.signature] # type: ignore - Reaction.id exists
    r = model_to_dict(reaction, only=fields)
    r["sender"] = reaction.sender.username # Make sure to select the username as well.
    return r

### CHECK FUNCTIONS ###

@atomic_wrapper
def user_exists(username: str):
    """True when username exists in database. False otherwise."""
    c = (User.select()
         .where(User.username == username)
         .count())
    return c != 0

@atomic_wrapper
def dm_exists(dm_id: int):
    """True when dm exists in database. False otherwise."""
    c = (DM.select()
         .where(DM.id == dm_id) # type: ignore - DM.id exists.
         .count())
    return c != 0

@atomic_wrapper
def dm_users_exists(usernames: "list[str]"):
    """True when list of usernames matches exactly with an existing dm."""
    users = set(User.select().where(User.username.in_(usernames)))
    # This is horrible code. At least it's only 1 query per test.
    g = (set(d.users) for d in DM.select())
    return users in g

@atomic_wrapper
def is_individual_dm(dm_id: int):
    """Is the user count == 2 for the given dm. Does not check dm id."""
    count = UserDM.select().where(UserDM.dm_id == dm_id).count()
    return count == 2

@atomic_wrapper
def user_in_dm(username: str, dm_id: int):
    """Determine if username is a part of the dm."""
    c = (UserDM.select()
         .join(User)
         .where((UserDM.dm_id == dm_id) & (User.username == username))
         .count())
    return c != 0

@atomic_wrapper
def message_in_user_dm(m_id: int, username: str):
    """Determine if message is a part of the user's dms."""
    c = (Message.select()
         .join(DM).join(UserDM).join(User)
         .where((Message.id == m_id) & (User.username == username)) # type: ignore
         .count())
    return c != 0

@atomic_wrapper
def message_exists(message_id: int):
    """True when message exists in database. False otherwise."""
    c = (Message.select()
         .where(Message.id == message_id) # type: ignore - Message.id exists.
         .count())
    return c != 0

@atomic_wrapper
def reaction_exists(reaction_id: int):
    """True when reaction exists in database. False otherwise."""
    c = (Reaction.select()
         .where(Reaction.id == reaction_id) # type: ignore - Reaction.id exists.
         .count())
    return c != 0









if __name__ == "__main__":
    # Some testing code.
    create_user("Joe", "01", "01", "01", "no") # id == 1
    create_user("Smith", "02", "01", "01", "no") # id == 2
    create_dm(["Joe", "Smith"], ["0102"]) # id == 1
    create_message(1, "Joe", "Hi", "01") # id == 1
    create_reaction(1, "Joe", "happy", "01") # id == 1
    create_reaction(1, "Joe", "sad", "01") # id == 2
    create_message(1, "Smith", "No reactions", "01") # id == 2
    create_message(1, "Smith", "Yay", "01") # id == 3
    create_reaction(3, "Joe", "pog", "01") # id == 3
    create_reaction(3, "Smith", "pog", "01") # id == 4
    create_dm(["Joe", "Smith"], ["0201"]) # id == 2
    create_user("Bill", "03", "01", "01", "no") # id == 3
    create_relation("Joe", "Smith", "friend")
    create_relation("Smith", "Bill", "friend")

    create_message(1, "Smith", "Yay", "01", 3) # id == 4
    logger.setLevel(logging.DEBUG)
