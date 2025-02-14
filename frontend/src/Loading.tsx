import { Center, Spinner, SpinnerProps } from "@chakra-ui/react";

export const Loading = ({ size = "md" }: { size?: SpinnerProps["size"] }) => {
	return (
		<Center h="full">
			<Spinner size={size} />
		</Center>
	);
};
