/* eslint-disable no-shadow */
// import { StrictMode } from 'react';
import { Box, Flex, ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { useState, useEffect, useRef } from "react";
// import Canvas from './components/canvas/canvas'; // Likely unused now
import Sidebar from "./components/sidebar/sidebar";
import Footer from "./components/footer/footer";
import { AiStateProvider } from "./context/ai-state-context";
import { Live2DConfigProvider } from "./context/live2d-config-context";
import { SubtitleProvider } from "./context/subtitle-context";
import { BgUrlProvider } from "./context/bgurl-context";
import { layoutStyles } from "./layout";
import WebSocketHandler from "./services/websocket-handler";
import { CameraProvider } from "./context/camera-context";
import { ChatHistoryProvider } from "./context/chat-history-context";
import { CharacterConfigProvider } from "./context/character-config-context";
import { Toaster } from "./components/ui/toaster";
import { VADProvider } from "./context/vad-context";
import { Live2D } from "./components/canvas/live2d";
import TitleBar from "./components/electron/title-bar";
import { InputSubtitle } from "./components/electron/input-subtitle";
import { ProactiveSpeakProvider } from "./context/proactive-speak-context";
import { ScreenCaptureProvider } from "./context/screen-capture-context";
import { SystemAudioProvider } from "./context/system-audio-context";
import { GroupProvider } from "./context/group-context";
import { BrowserProvider } from "./context/browser-context";
// eslint-disable-next-line import/no-extraneous-dependencies, import/newline-after-import
import "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import Background from "./components/canvas/background";
import WebSocketStatus from "./components/canvas/ws-status";
import Subtitle from "./components/canvas/subtitle";
import { ModeProvider, useMode } from "./context/mode-context";
import ToolApprovalDialog from "./components/tool-approval-dialog";
import { ToolApprovalProvider } from "./context/tool-approval-context";
import { ClaudeUsageProvider } from "./context/claude-usage-context";
import { SessionProvider, useSession } from "./context/session-context";
import { AttachmentProvider } from "./context/attachment-context";
import SessionRail, { SESSION_RAIL_WIDTH } from "./components/sidebar/session-rail";

function AppContent(): JSX.Element {
  const [showSidebar, setShowSidebar] = useState(true);
  const [isFooterCollapsed, setIsFooterCollapsed] = useState(false);
  const { mode } = useMode();
  const isElectron = window.api !== undefined;
  const live2dContainerRef = useRef<HTMLDivElement>(null);
  // 다중 세션 레일(TODO19 2단계)은 letta agent 에서만 보인다.
  // Live2D 는 Flex 바깥의 absolute 요소라 레일 폭이 자동 반영되지 않아 직접 더해준다.
  const { supported: sessionRailVisible } = useSession();
  const railWidth = sessionRailVisible ? SESSION_RAIL_WIDTH : 0;

  useEffect(() => {
    const handleResize = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

    
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.height = '100%';
  document.body.style.height = '100%';
  document.documentElement.style.position = 'fixed';
  document.body.style.position = 'fixed';
  document.documentElement.style.width = '100%';
  document.body.style.width = '100%';

  // Define base style properties shared across modes/breakpoints
  const live2dBaseStyle = {
    position: "absolute" as const,
    overflow: "hidden",
    transition: "all 0.3s ease-in-out", // Optional transition
    pointerEvents: "auto" as const,
  };

  // Define styles specifically for the "window" mode, using responsive syntax
  const getResponsiveLive2DWindowStyle = (sidebarVisible: boolean) => {
    const leftOffset = `${(sidebarVisible ? 440 : 24) + railWidth}px`;
    return {
      ...live2dBaseStyle,
      top: isElectron ? "30px" : "0px",
      height: `calc(100% - ${isElectron ? "30px" : "0px"})`,
      zIndex: 5, // Ensure it's layered correctly below UI but above background
      left: {
        base: "0px", // Column layout (base): Start from left edge
        md: leftOffset, // Row layout (md+): Offset by session rail + sidebar width
      },
      width: {
        base: "100%", // Column layout (base): Full width
        md: `calc(100% - ${leftOffset})`, // Row layout (md+): Adjust width based on sidebar
      },
    };
  };

  // Define styles specifically for the "pet" mode
  const live2dPetStyle = {
    ...live2dBaseStyle,
    top: 0, // Override position for pet mode
    left: 0,
    width: "100vw", // Full viewport
    height: "100vh",
    zIndex: 15, // Higher zIndex for pet mode overlay
  };

  return (
    <>
      <Box
        ref={live2dContainerRef}
        // Apply styles conditionally based on mode
        // Use the function to get dynamic responsive styles for window mode
        {...(mode === "window"
          ? getResponsiveLive2DWindowStyle(showSidebar)
          : live2dPetStyle)}
      >
        <Live2D />
      </Box>

      {/* Conditional Rendering of Window UI */}
      {mode === "window" && (
        <>
          {isElectron && <TitleBar />}
          {/* Apply styles by spreading */}
          <Flex {...layoutStyles.appContainer}>
            <SessionRail />
            <Box
              {...layoutStyles.sidebar}
              {...(!showSidebar && { width: "24px" })}
            >
              <Sidebar
                isCollapsed={!showSidebar}
                onToggle={() => setShowSidebar(!showSidebar)}
              />
            </Box>
            <Box {...layoutStyles.mainContent}>
              <Background />
              <Box position="absolute" top="20px" left="20px" zIndex={10}>
                <WebSocketStatus />
              </Box>
              <Box
                position="absolute"
                bottom={isFooterCollapsed ? "39px" : "135px"}
                left="50%"
                transform="translateX(-50%)"
                zIndex={10}
                width="60%"
              >
                <Subtitle />
              </Box>
              <Box
                {...layoutStyles.footer}
                zIndex={10}
                {...(isFooterCollapsed && layoutStyles.collapsedFooter)}
              >
                <Footer
                  isCollapsed={isFooterCollapsed}
                  onToggle={() => setIsFooterCollapsed(!isFooterCollapsed)}
                />
              </Box>
            </Box>
          </Flex>
        </>
      )}

      {/* Conditional Rendering of Pet Mode UI */}
      {mode === "pet" && <InputSubtitle />}
    </>
  );
}

function App(): JSX.Element {
  return (
    <ChakraProvider value={defaultSystem}>
      {/* ModeProvider needs to wrap AppContent to provide mode to getGlobalStyles */}
      <ModeProvider>
        <AppWithGlobalStyles />
      </ModeProvider>
    </ChakraProvider>
  );
}

// New component to access mode for global styles
function AppWithGlobalStyles(): JSX.Element {
  return (
    <>
      <CameraProvider>
        <ScreenCaptureProvider>
          <SystemAudioProvider>
            <CharacterConfigProvider>
            <ChatHistoryProvider>
              <ClaudeUsageProvider>
              <AiStateProvider>
                <ProactiveSpeakProvider>
                  <Live2DConfigProvider>
                    <SubtitleProvider>
                      <VADProvider>
                        <BgUrlProvider>
                          <GroupProvider>
                            <BrowserProvider>
                              <SessionProvider>
                                <AttachmentProvider>
                                  <ToolApprovalProvider>
                                    <WebSocketHandler>
                                      <Toaster />
                                      <ToolApprovalDialog />
                                      <AppContent />
                                    </WebSocketHandler>
                                  </ToolApprovalProvider>
                                </AttachmentProvider>
                              </SessionProvider>
                            </BrowserProvider>
                          </GroupProvider>
                        </BgUrlProvider>
                      </VADProvider>
                    </SubtitleProvider>
                  </Live2DConfigProvider>
                </ProactiveSpeakProvider>
              </AiStateProvider>
              </ClaudeUsageProvider>
            </ChatHistoryProvider>
          </CharacterConfigProvider>
          </SystemAudioProvider>
        </ScreenCaptureProvider>
      </CameraProvider>
    </>
  );
}

export default App;
