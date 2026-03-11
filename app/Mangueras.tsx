import { getManguerasAction, getUsuariosAction } from "./actions";
import { ManguerasClient } from "./ManguerasClient";

export default async function Mangueras() {
  const [mangueras, usuarios] = await Promise.all([
    getManguerasAction(),
    getUsuariosAction(),
  ]);

  return <ManguerasClient mangueras={mangueras} usuarios={usuarios} />;
}
