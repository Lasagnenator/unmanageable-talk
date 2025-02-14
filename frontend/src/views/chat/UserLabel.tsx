import { HStack, Heading, HeadingProps, Text } from "@chakra-ui/react";
import { Loading } from "../../Loading";
import { useUser } from "../../hooks/useUser";
import { getStatus } from "./StatusSelector";

export const UserLabel = ({
	username,
	isHeading = false,
	size,
}: {
	username: string;
	isHeading?: boolean;
	size?: HeadingProps["size"];
}) => {
	const userQuery = useUser(username);

	if (!userQuery.data) {
		return <Loading />;
	}

	const status = getStatus(userQuery.data.status);

	return (
		<HStack gap={1}>
			{isHeading ? (
				<Heading size={size ?? "sm"} noOfLines={1}>
					{username}
				</Heading>
			) : (
				<Text noOfLines={1} size={size ?? "md"}>
					{username}
				</Text>
			)}
			{status.icon()}
		</HStack>
	);
};
