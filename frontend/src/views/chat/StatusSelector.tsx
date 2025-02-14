import { Menu, MenuButton, Button, MenuList, MenuItem, Icon } from "@chakra-ui/react";
import { Status, User } from "../../types";
import { useMutation } from "@tanstack/react-query";
import { useUser } from "../../hooks/useUser";
import { queryClient } from "../../queryClient";
import { unwrapServerResult } from "../../utils";
import { useCurrentUser } from "../../hooks/useCurrentUser";
import { useSocket } from "../../hooks/useSocket";
import { IconCircleFilled, IconCircle, IconMoonFilled, IconCircleXFilled } from "@tabler/icons-react";

export const STATUSES: Record<Status, { icon: () => React.ReactElement; label: string; shortLabel?: string }> = {
	online: { icon: () => <Icon as={IconCircleFilled} color="green.400" />, label: "Online" },
	offline: { icon: () => <Icon as={IconCircle} color="grey.400" />, label: "Offline" },
	away: { icon: () => <Icon as={IconMoonFilled} color="yellow.400" />, label: "Away" },
	dnd: { icon: () => <Icon as={IconCircleXFilled} color="red.400" />, label: "Do Not Disturb", shortLabel: "DND" },
};

export const isStatus = (s: string): s is Status => Object.keys(STATUSES).includes(s);
export const getStatus = (status: string) => STATUSES[isStatus(status) ? status : "offline"];

export const StatusSelector = () => {
	const socket = useSocket();
	const { username } = useCurrentUser();
	const userQuery = useUser(username);

	const updateStatusMutation = useMutation({
		mutationFn: async (status: Status) => {
			await unwrapServerResult(socket.emitWithAck("set_user", { status }));
		},
		onSuccess: (_, status) => {
			queryClient.setQueryData<User>(["user", { username }], (prev) => (prev ? { ...prev, status } : undefined));
		},
	});

	const status = userQuery.data ? getStatus(userQuery.data.status) : null;

	return (
		<Menu>
			<MenuButton as={Button} isLoading={!status} rightIcon={status?.icon()} minW="11ch">
				{status && (status.shortLabel ?? status.label)}
			</MenuButton>
			<MenuList>
				{Object.entries(STATUSES).map(([k, status]) => (
					<MenuItem icon={status.icon()} onClick={() => updateStatusMutation.mutate(k as Status)} key={k}>
						{status.label}
					</MenuItem>
				))}
			</MenuList>
		</Menu>
	);
};
