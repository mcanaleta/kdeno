import { execString } from "./exec.ts";

export type HcloudServer = {
  id: number;
  name: string;
  status: string;
  created: string;
  public_net: {
    ipv4: {
      ip: string;
    };
  };
  server_type: {
    name: string;
  };
};

export async function hcloudServerList(): Promise<HcloudServer[]> {
  const output = await execString("hcloud", [
    "server",
    "list",
    "--output",
    "json",
  ]);
  const j = JSON.parse(output) as HcloudServer[];
  return j;
}
