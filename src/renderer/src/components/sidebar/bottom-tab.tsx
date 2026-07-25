/* eslint-disable */
import { Tabs, IconButton, Box } from '@chakra-ui/react'
import {
  FiCamera,
  FiMonitor,
  FiGlobe,
  FiVolume2,
  FiChevronDown,
  FiChevronUp,
} from 'react-icons/fi'
import { useTranslation } from 'react-i18next'
import { sidebarStyles } from './sidebar-styles'
import CameraPanel from './camera-panel'
import ScreenPanel from './screen-panel'
import BrowserPanel from './browser-panel'
import SystemAudioPanel from './system-audio-panel'

interface BottomTabProps {
  collapsed: boolean
  onToggleCollapsed: () => void
}

function BottomTab({ collapsed, onToggleCollapsed }: BottomTabProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <Tabs.Root
      defaultValue="camera"
      variant="plain"
      {...sidebarStyles.bottomTab.container}
    >
      <Box display="flex" alignItems="center" gap="2" width="100%">
        <Tabs.List {...sidebarStyles.bottomTab.list} style={{ flex: 1 }}>
          <Tabs.Trigger value="camera" {...sidebarStyles.bottomTab.trigger}>
            <FiCamera />
            {t('sidebar.camera')}
          </Tabs.Trigger>
          <Tabs.Trigger value="screen" {...sidebarStyles.bottomTab.trigger}>
            <FiMonitor />
            {t('sidebar.screen')}
          </Tabs.Trigger>
          <Tabs.Trigger value="audio" {...sidebarStyles.bottomTab.trigger}>
            <FiVolume2 />
            오디오
          </Tabs.Trigger>
          <Tabs.Trigger value="browser" {...sidebarStyles.bottomTab.trigger}>
            <FiGlobe />
            {t('sidebar.browser')}
          </Tabs.Trigger>
        </Tabs.List>
        <IconButton
          aria-label={collapsed ? '프리뷰 펼치기' : '프리뷰 접기'}
          title={collapsed ? '프리뷰 펼치기' : '프리뷰 접기'}
          size="sm"
          variant="ghost"
          color="whiteAlpha.700"
          _hover={{ color: 'white', bg: 'whiteAlpha.100' }}
          onClick={onToggleCollapsed}
        >
          {collapsed ? <FiChevronUp /> : <FiChevronDown />}
        </IconButton>
      </Box>

      {!collapsed && (
        <>
          <Tabs.Content value="camera">
            <CameraPanel />
          </Tabs.Content>

          <Tabs.Content value="screen">
            <ScreenPanel />
          </Tabs.Content>

          <Tabs.Content value="audio">
            <SystemAudioPanel />
          </Tabs.Content>

          <Tabs.Content value="browser">
            <BrowserPanel />
          </Tabs.Content>
        </>
      )}
    </Tabs.Root>
  );
}

export default BottomTab
