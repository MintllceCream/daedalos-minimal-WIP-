import { useEffect } from "react";
import { useFileSystem } from "contexts/fileSystem";
import { useSession } from "contexts/session";

const resetSkin = async (): Promise<void> => {
  const { resetSkinVars } = await import("utils/skinFunctions");

  resetSkinVars();
};

const useWindowSkin = (): void => {
  const { windowSkin, sessionLoaded } = useSession();
  const { readFile } = useFileSystem();

  useEffect(() => {
    if (!sessionLoaded || !windowSkin) return;

    readFile(windowSkin)
      .then(async (buffer) => {
        if (!buffer?.length) return;

        const { parseSkinFile, applySkinVars } = await import(
          "utils/skinFunctions"
        );

        resetSkin();
        applySkinVars(await parseSkinFile(buffer));
      })
      .catch(resetSkin);
  }, [windowSkin, sessionLoaded, readFile]);
};

export default useWindowSkin;
