// eslint-disable-next-line react/jsx-filename-extension
import { useEffect } from "react";
import { type ComponentProcessProps } from "components/system/Apps/RenderComponent";
import { useProcesses } from "contexts/process";
import { useSession } from "contexts/session";

const WindowBlinds: FC<ComponentProcessProps> = ({ id }) => {
  const {
    close,
    processes: { [id]: process },
  } = useProcesses();
  const { url = "" } = process || {};
  const { setWindowSkin } = useSession();

  useEffect(() => {
    if (url) setWindowSkin(url);

    close(id);
  }, [close, id, setWindowSkin, url]);

  // eslint-disable-next-line unicorn/no-null
  return null;
};

export default WindowBlinds;
