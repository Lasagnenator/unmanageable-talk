import { Icon, Text, VStack } from "@chakra-ui/react";
import { IconBug } from "@tabler/icons-react";
import { FallbackProps } from "react-error-boundary";

export const ErrorPage = ({ error }: FallbackProps) => {
	return (
		<VStack h="full" align="center" justify="center" gap={4}>
			<Icon as={IconBug} boxSize={36} color="gray.400" />
			<Text fontWeight="bold" color="gray.500">
				{error instanceof Error ? error.message : "Something went wrong!"}
			</Text>
		</VStack>
	);
};
