import {
  createContext, useContext, useState, useMemo, useEffect, useCallback,
} from 'react';

/**
 * Character configuration file interface
 * @interface ConfigFile
 */
export interface ConfigFile {
  filename: string;
  name: string;
}

/**
 * Character configuration context state interface
 * @interface CharacterConfigState
 */
interface CharacterConfigState {
  confName: string;
  confUid: string;
  /** AI 표시 이름 (conf.yaml character_name). 말풍선 화자 표시에 사용 */
  characterName: string;
  /** 사용자 표시 이름 (conf.yaml human_name) */
  humanName: string;
  configFiles: ConfigFile[];
  setConfName: (name: string) => void;
  setConfUid: (uid: string) => void;
  setCharacterName: (name: string) => void;
  setHumanName: (name: string) => void;
  setConfigFiles: (files: ConfigFile[]) => void;
  getFilenameByName: (name: string) => string | undefined;
}

/**
 * Default values and constants
 */
const DEFAULT_CONFIG = {
  confName: '',
  confUid: '',
  characterName: '',
  humanName: '',
  configFiles: [] as ConfigFile[],
};

/**
 * Create the character configuration context
 */
export const ConfigContext = createContext<CharacterConfigState | null>(null);

/**
 * Character Configuration Provider Component
 * @param {Object} props - Provider props
 * @param {React.ReactNode} props.children - Child components
 */
export function CharacterConfigProvider({ children }: { children: React.ReactNode }) {
  const [confName, setConfName] = useState<string>(DEFAULT_CONFIG.confName);
  const [confUid, setConfUid] = useState<string>(DEFAULT_CONFIG.confUid);
  const [characterName, setCharacterName] = useState<string>(DEFAULT_CONFIG.characterName);
  const [humanName, setHumanName] = useState<string>(DEFAULT_CONFIG.humanName);
  const [configFiles, setConfigFiles] = useState<ConfigFile[]>(DEFAULT_CONFIG.configFiles);

  const getFilenameByName = useCallback(
    (name: string) => configFiles.find((config) => config.name === name)?.filename,
    [configFiles],
  );

  // Memoized context value
  const contextValue = useMemo(
    () => ({
      confName,
      confUid,
      characterName,
      humanName,
      configFiles,
      setConfName,
      setConfUid,
      setCharacterName,
      setHumanName,
      setConfigFiles,
      getFilenameByName,
    }),
    [confName, confUid, characterName, humanName, configFiles, getFilenameByName],
  );

  useEffect(() => {
    (window.api as any)?.updateConfigFiles?.(configFiles);
  }, [configFiles]);

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
}

/**
 * Custom hook to use the character configuration context
 * @throws {Error} If used outside of CharacterConfigProvider
 */
export function useConfig() {
  const context = useContext(ConfigContext);

  if (!context) {
    throw new Error('useConfig must be used within a CharacterConfigProvider');
  }

  return context;
}
