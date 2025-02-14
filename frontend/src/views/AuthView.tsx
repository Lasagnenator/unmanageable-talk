import { ChevronLeftIcon, MoonIcon, SunIcon } from "@chakra-ui/icons";
import { Box, Center, IconButton, useColorMode, useColorModeValue } from "@chakra-ui/react";
import { PropsWithChildren } from "react";
import { useLocation } from "wouter";
import darkModeBackground from "../assets/auth-background-dark.jpg";
import lightModeBackground from "../assets/auth-background.jpg";

export const AuthView = ({ back, children }: PropsWithChildren<{ back?: { href: string; label: string } }>) => {
	const { colorMode, toggleColorMode } = useColorMode();
	const cardBg = useColorModeValue("white", "gray.700");
	const backgroundImage = useColorModeValue(lightModeBackground, darkModeBackground);

	const [location, setLocation] = useLocation();

	return (
		<Box
			h="100vh"
			w="100%"
			backgroundImage={`url(${backgroundImage})`}
			backgroundPosition="center"
			backgroundRepeat="no-repeat"
			backgroundSize="cover"
			pos="relative"
		>
			<Center h="100%" w="100%">
				<Box w={["90%", "80%", "70%", "60%"]} p={8} bg={cardBg} borderRadius="lg" boxShadow="lg" pos="relative">
					{back && (
						<IconButton
							aria-label={back.label}
							icon={<ChevronLeftIcon />}
							onClick={() => setLocation(back.href)}
							pos="absolute"
							top="1rem"
							left="1rem"
						/>
					)}
					<IconButton
						aria-label="Toggle Color Mode"
						icon={colorMode === "light" ? <MoonIcon /> : <SunIcon />}
						onClick={toggleColorMode}
						pos="absolute"
						top="1rem"
						right="1rem"
					/>
					{children}
				</Box>
			</Center>
		</Box>
	);
};
