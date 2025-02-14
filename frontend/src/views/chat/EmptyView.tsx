import { Icon, Text, VStack, useColorModeValue } from "@chakra-ui/react";
import { IconMessageSearch } from "@tabler/icons-react";

export const EmptyView = () => {
	const color = useColorModeValue("gray.500", "gray.400");
	const bg = useColorModeValue("gray.50", "gray.900");
	return (
		<VStack h="full" align="center" justify="center" gap={4} bg={bg} color={color}>
			<Icon as={IconMessageSearch} boxSize={36} />
			<Text fontWeight="bold">Open a DM to start messaging!</Text>
		</VStack>
	);
};
