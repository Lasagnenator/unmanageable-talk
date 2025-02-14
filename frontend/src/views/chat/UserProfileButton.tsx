import { AvatarProps, Button, ButtonProps, HStack, HeadingProps, useDisclosure } from "@chakra-ui/react";
import { UserLabel } from "./UserLabel";
import { ProfileModal } from "./ProfileModal";
import { UserAvatar } from "./UserAvatar";

export const UserProfileButton = ({
	username,
	isHeading,
	variant,
	avatarSize,
	labelSize,
}: {
	username: string;
	isHeading?: boolean;
	labelSize?: HeadingProps["size"];
	avatarSize?: AvatarProps["size"];
	variant?: ButtonProps["variant"];
}) => {
	const { isOpen, onClose, getButtonProps } = useDisclosure();

	return (
		<>
			<Button variant={variant} {...getButtonProps()} px={1}>
				<HStack>
					<UserAvatar username={username} size={avatarSize} />
					<UserLabel username={username} size={labelSize} isHeading={isHeading} />
				</HStack>
			</Button>
			<ProfileModal username={username} isOpen={isOpen} onClose={onClose} />
		</>
	);
};
