export type Status = "offline" | "online" | "away" | "dnd";

export type CurrentUser = {
	username: string;
	privateKey: string;
};

export type User = {
	username: string;
	public_key: string;
	spk: string | null;
	sig: string | null; // sig(spk, priv)
	status: string;
	biography: string;
	profile_picture: string;
};

export type UserWithOwnStorage = User & {
	own_storage: string; // encrypted, hex encoded
};

export type Reaction = {
	id: number;
	sender: string;
	reaction: string; // encrypted, hex encoded
	signiture: string;
};

export type Message = {
	id: number;
	timestamp: string;
	message: string; // encrypted, hex encoded
	signature: string; // sig(message, priv)
	sender: string;
	dm_id: number;
	pinned: boolean;
	reactions: Reaction[];
	delete_timestamp: string | null;
};

export type ScheduledMessage = {
	message: string;
	timestamp: string;
};

export type DM = {
	id: number;
	name: string | null;
	created_at: string;
	users: string[];
	latest_message: Message | null;
	scheduled_messages: Record<number, ScheduledMessage>;
	users_in_call: Record<string, string>;
};

export type KeyBundle = { ik: string; spk: string; sig: string };

export type TypingNotification = { id: number; username: string };
export type X3DHNotification = {
	id: number;
	sender: string;
	ik: string;
	spk: string;
	ek: string;
	key_tree: string[];
	position: number;
};
export type KeyStorage = { privSPK: string; sharedKeys: Record<number, string> };

export type ServerResult<T, E = string> = { success: true; result: T } | { success: false; result: E };
