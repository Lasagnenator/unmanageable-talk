import { Heading, HeadingProps, Text } from "@chakra-ui/react";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { DM } from "../../types";
import { getDMName } from "../../utils";

export const GroupLabel = ({
	dm,
	isHeading = false,
	size,
}: {
	dm: DM;
	isHeading?: boolean;
	size?: HeadingProps["size"];
}) => {
	const { username } = useCurrentUser();

	return (
		<>
			{isHeading ? (
				<Heading size={size ?? "sm"} noOfLines={1}>
					{getDMName(dm, username)}
				</Heading>
			) : (
				<Text noOfLines={1} size={size ?? "md"}>
					{getDMName(dm, username)}
				</Text>
			)}
		</>
	);
};
