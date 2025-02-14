import { Avatar, AvatarProps, HeadingProps } from "@chakra-ui/react";
import { Loading } from "../../Loading";
import { useUser } from "../../hooks/useUser";

export const UserAvatar = ({ username, size = "md" }: { username: string; size?: AvatarProps["size"] }) => {
	const userQuery = useUser(username);

	if (!userQuery.data) {
		return <Loading />;
	}

	return <Avatar size={size} bg={userQuery.data.profile_picture || "gray.400"} />;
};
