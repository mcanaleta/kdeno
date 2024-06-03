import { exec } from "./exec.ts";
import { SshServer } from "./ssh.ts";
import { parse } from "jsr:@std/yaml";

export type KubeCluster = {
  name: string;
  cluster: {
    "certificate-authority-data"?: string;
    "certificate-authority"?: string;
    server: string;
  };
};

export type KubeUser = {
  name: string;
  user: {
    "client-certificate-data"?: string;
    "client-certificate"?: string;
    "client-key-data"?: string;
    "client-key"?: string;
  };
};

export type KubeContext = {
  name: string;
  context: {
    cluster: string;
    namespace: string;
    user: string;
  };
};

export type KubeConfig = {
  clusters: KubeCluster[];
  users: KubeUser[];
  contexts: KubeContext[];
};

export function k3sGetToken(server: SshServer) {
  return server.execString("sudo cat /var/lib/rancher/k3s/server/node-token");
}

export function k3sInstallCmd(
  envVars: Record<string, string>,
  params: string[]
) {
  const en = Object.entries(envVars)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  const par = params.join(" ");
  const cmd = `curl -sfL https://get.k3s.io | ${en} sh -s - ${par}`;
  return cmd;
}

export async function k3sInstall(
  server: SshServer,
  role: "server" | "agent",
  master?: SshServer
) {
  const env: Record<string, string> = {};
  if (master) {
    env.K3S_URL = `https://${master.hostname}:6443`;
    env.K3S_TOKEN = await k3sGetToken(master);
  }
  const params: string[] = [];
  if (role == "server") {
    if (!master) {
      params.push("--cluster-init");
    }
    params.push("--tls-san", server.hostname);
  }
  await server.exec(k3sInstallCmd(env, params));
}

export async function k3sGetConfig(server: SshServer) {
  const ymlRaw = await server.execString("sudo cat /etc/rancher/k3s/k3s.yaml");
  const config = parse(ymlRaw) as KubeConfig;
  return config;
  //   const ca = creds.clusters[0].cluster["certificate-authority-data"];
  //   const clientCert = creds.users[0].user["client-certificate-data"];
  //   const clientKey = creds.users[0].user["client-key-data"];

  //   ca := kubeconfig.Clusters[0].Cluster.CertificateAuthorityData
  //   clientCert := kubeconfig.Users[0].User.ClientCertificateData
  //   clientKey := kubeconfig.Users[0].User.ClientKeyData
  //   name := sshServer.Name
  //   home, err := os.UserHomeDir()
  //   utils.Check(err)

  //   write := func(fileName string, data []byte) string {
  //       p := path.Join(home, ".kube", name+"-"+fileName)
  //       err := os.WriteFile(p, data, 0644)
  //       utils.Check(err)
  //       return p
  //   }
  //   caPath := write("ca.crt", utils.B64decode(ca))
  //   clientCrtPath := write("crt", utils.B64decode(clientCert))
  //   clientKeyPath := write("key", utils.B64decode(clientKey))

  //   print(caPath, clientCrtPath, clientKeyPath)

  //   server := fmt.Sprintf("https://%s:6443", ip)

  //   kubecfg := func(args ...string) {
  //       cmds.RunCommand("kubectl", append([]string{"config"}, args...)...)
  //   }

  //   kubecfg("set-cluster", name, "--server", server, "--certificate-authority", caPath)
  //   kubecfg("set-credentials", name, "--client-certificate", clientCrtPath, "--client-key", clientKeyPath)
  //   kubecfg("set-context", name, "--cluster", name, "--user", name)
  //   kubecfg("use-context", name)
}

export async function k3sDownloadKubeConfig(name: string, server: SshServer) {
  const config = await k3sGetConfig(server);
  const ca = config.clusters[0].cluster["certificate-authority-data"]!;
  const url = `https://${server.hostname}:6443`;
  const clientCert = config.users[0].user["client-certificate-data"]!;
  const clientKey = config.users[0].user["client-key-data"]!;
  const kubeCfg = (args: string[]) => exec("kubectl", ["config", ...args]);

  await kubeCfg([
    "set-cluster",
    name,
    "--server",
    url,
    "--certificate-authority-data",
    ca,
  ]);
  await kubeCfg([
    "set-credentials",
    name,
    "--client-certificate-data",
    clientCert,
    "--client-key-data",
    clientKey,
  ]);

  await kubeCfg(["set-context", name, "--cluster", name, "--user", name]);
  await kubeCfg(["use-context", name]);
}
