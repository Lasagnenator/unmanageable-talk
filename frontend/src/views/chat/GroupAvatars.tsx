import { Avatar, AvatarGroup, AvatarProps, HeadingProps } from "@chakra-ui/react";
import { DM, User } from "../../types";
import { UserAvatar } from "./UserAvatar";
import { useUsers } from "../../hooks/useUsers";
import { DefinedUseQueryResult } from "@tanstack/react-query";
import { Loading } from "../../Loading";
import { useCurrentUser } from "../../hooks/useCurrentUser";

export const GroupAvatars = ({
	dm,
	avatarMax = 2,
	size = "md",
}: {
	dm: DM;
	avatarMax?: number;
	size?: AvatarProps["size"];
}) => {
	const { username } = useCurrentUser();
	const userQueries = useUsers(dm.users.filter((u) => u !== username));

	if (!userQueries.every((u): u is DefinedUseQueryResult<User> => !!u.data)) {
		return <Loading />;
	}

	return (
		<AvatarGroup size={size} max={avatarMax}>
			{userQueries.map((userQuery) => (
				<Avatar key={userQuery.data.username} size="sm" bg={userQuery.data.profile_picture || "gray.400"} />
			))}
		</AvatarGroup>
	);
};
