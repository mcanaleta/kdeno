import { parse, stringify } from "jsr:@std/yaml@0.224.1";
import type {
  io_k8s_api_apps_v1_Deployment,
  io_k8s_api_apps_v1_StatefulSet,
  io_k8s_api_apps_v1_StatefulSetSpec,
  io_k8s_api_batch_v1_Job,
  io_k8s_api_core_v1_EnvVar,
  io_k8s_api_core_v1_PodSpec,
  io_k8s_api_core_v1_Secret,
  io_k8s_api_core_v1_Service,
  io_k8s_api_core_v1_ServicePort,
} from "./k8s/types.gen.ts";
import { execCheck } from "./mod.ts";
import { generatePassword } from "./security.ts";

export async function k8sSetSecret(
  context: string,
  namespace: string,
  name: string,
  data: Record<string, string>,
  type = "Opaque"
) {
  const secretYaml: io_k8s_api_core_v1_Secret = {
    apiVersion: "v1",
    kind: "Secret",
    type,
    metadata: {
      name,
      namespace,
    },
    data: Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, btoa(v)])
    ),
  };

  await k8sApply(context, namespace, secretYaml);
}

export type K8sSimpleEnv = {
  envSecrets?: Record<string, string>;
  envPlain?: Record<string, string>;
};

export function k8sSimpleEnv(props: K8sSimpleEnv): io_k8s_api_core_v1_EnvVar[] {
  if (Object.values(props.envSecrets ?? {}).some((v) => !v.includes("."))) {
    throw new Error("envSecrets must be in the format secretName.secretKey");
  }
  const env: io_k8s_api_core_v1_EnvVar[] = [
    ...Object.entries(props.envSecrets ?? {}).map(([name, secret]) => ({
      name,
      valueFrom: {
        secretKeyRef: {
          name: secret.split(".")[0],
          key: secret.split(".")[1],
        },
      },
    })),
    ...Object.entries(props.envPlain ?? {}).map(([name, value]) => ({
      name,
      value,
    })),
  ];
  return env;
}

export async function k8sApply(
  context: string,
  namespace: string,
  data: object
) {
  console.log(JSON.stringify(data, null, 2));
  const toYaml = stringify(data, {});
  const cmd = new Deno.Command("kubectl", {
    args: ["--context", context, "apply", "-n", namespace, "-f", "-"],
    stdout: "inherit",
    stderr: "inherit",
    stdin: "piped",
  });
  const child = cmd.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(toYaml));
  await writer.close();
  const status = await child.status;
  if (!status.success) {
    throw new Error(`kubectl apply failed with exit code ${status.code}`);
  }
}

export class K8sNamespace {
  constructor(private context: string, private namespace: string) {}

  apply(data: object): Promise<void> {
    return k8sApply(this.context, this.namespace, data);
  }

  setSecret(
    name: string,
    data: Record<string, string>,
    type = "Opaque"
  ): Promise<void> {
    console.log("setting secret", name);
    return k8sSetSecret(this.context, this.namespace, name, data, type);
  }

  createNamespace(): Promise<void> {
    return this.apply({
      apiVersion: "v1",
      kind: "Namespace",
      metadata: {
        name: this.namespace,
      },
    });
  }

  async getResource(resource: string, name: string): Promise<unknown | null> {
    const cmd = this.kubectl(["get", resource, name, "-o", "yaml"], {
      stdout: "piped",
    });
    const out = await cmd.output();
    if (out.code === 0) {
      return parse(new TextDecoder().decode(out.stdout));
    } else {
      const err = new TextDecoder().decode(out.stderr);
      if (err.includes("not found")) {
        return null;
      }
      throw new Error(`failed to get resource ${resource}/${name}: ${err}`);
    }
  }

  async initRandomSecret(name: string, opts: { key: string }): Promise<void> {
    const existingSecret = await this.getResource("secret", name);
    if (existingSecret) {
      console.log(`secret ${name} already exists`);
      return;
    }
    const secret = {
      [opts.key]: generatePassword(32),
    };
    await this.setSecret(name, secret);
  }

  async runOneTimeJob(name: string, jobSpec: io_k8s_api_core_v1_PodSpec) {
    const jobDef: io_k8s_api_batch_v1_Job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name,
      },
      spec: {
        backoffLimit: 0,
        template: {
          spec: jobSpec,
        },
        ttlSecondsAfterFinished: 7 * 24 * 60 * 60,
      },
    };
    await this.apply(jobDef);
    console.log("waiting job to be created");
    let success = false;
    while (true) {
      const job = (await this.getResource(
        "job",
        name
      )) as io_k8s_api_batch_v1_Job;
      if (job) {
        if (job.status?.failed) {
          break;
        } else if (job.status?.succeeded) {
          success = true;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log("logs...");
    await execCheck(
      this.kubectl(["logs", "--tail", "50", "-f", "-l", `job-name=${name}`])
    );
    if (!success) {
      throw new Error(`job ${name} failed`);
    }
    console.log("end of logs");
  }

  kubectl(args: string[], opts: Deno.CommandOptions = {}): Deno.Command {
    // console.log("running kubectl", args);
    const cmd = new Deno.Command("kubectl", {
      args: ["--context", this.context, "-n", this.namespace, ...args],
      stdout: "inherit",
      ...opts,
    });
    return cmd;
  }

  async service(
    name: string,
    ports: Array<io_k8s_api_core_v1_ServicePort>
  ): Promise<void> {
    const serviceDef: io_k8s_api_core_v1_Service = {
      apiVersion: "v1",
      kind: "Service",
      metadata: {
        name,
      },
      spec: {
        selector: {
          app: name,
        },
        ports,
        type: "ClusterIP",
      },
    };
    await this.apply(serviceDef);
  }

  async createPullSecret(
    secretName: string,
    url: string,
    username: string,
    password: string
  ) {
    const auth = btoa(`${username}:${password}`);
    const j = {
      auths: {
        [url]: {
          auth,
        },
      },
    };

    await this.setSecret(
      secretName,
      {
        ".dockerconfigjson": JSON.stringify(j),
      },
      "kubernetes.io/dockerconfigjson"
    );
  }

  async deploymentAndService(
    name: string,
    deploymentSpec: io_k8s_api_core_v1_PodSpec,
    ports?: number[]
  ) {
    const deploymentDef: io_k8s_api_apps_v1_Deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name,
        labels: {
          app: name,
        },
      },
      spec: {
        selector: {
          matchLabels: {
            app: name,
          },
        },
        replicas: 3,
        template: {
          metadata: {
            labels: {
              app: name,
            },
          },
          spec: deploymentSpec,
        },
      },
    };
    await this.apply(deploymentDef);

    if (ports?.length) {
      await this.service(
        name,
        ports.map((port) => ({
          protocol: "TCP",
          port,
          // targetPort: `${port}`,
        }))
      );
    }
  }

  async statefulSetAndService(
    name: string,
    opts: {
      templateSpec: io_k8s_api_core_v1_PodSpec;
      replicas: number;
      statefulSetExtra?: Partial<io_k8s_api_apps_v1_StatefulSet>;
      specExtra?: Partial<io_k8s_api_apps_v1_StatefulSetSpec>;
    }
  ) {
    const statefulSetDef: io_k8s_api_apps_v1_StatefulSet = {
      apiVersion: "apps/v1",
      kind: "StatefulSet",
      metadata: {
        name,
        labels: {
          app: name,
        },
      },
      spec: {
        serviceName: name,
        replicas: opts.replicas,
        selector: {
          matchLabels: {
            app: name,
          },
        },
        template: {
          metadata: {
            labels: {
              app: name,
            },
          },
          spec: opts.templateSpec,
        },
        ...opts.specExtra,
      },
      ...opts.statefulSetExtra,
    };
    await this.apply(statefulSetDef);
    const ports = opts.templateSpec.containers
      .map((container) => container.ports)
      .flat()
      .map((port) => port?.containerPort)
      .filter((port) => port !== undefined) as number[];

    if (ports.length) {
      await this.service(
        name,
        ports.map((port) => ({
          protocol: "TCP",
          port,
          // targetPort: `${port}`,
        }))
      );
    }
  }

  async simpleStatefulSetPvService(
    name: string,
    props: {
      image: string;
      env?: K8sSimpleEnv;
      volumePath: string;
      volumeSize: string;
      ports: number[];
    }
  ) {
    await this.statefulSetAndService("postgres", {
      replicas: 1,
      templateSpec: {
        containers: [
          {
            name,
            image: props.image,
            env: k8sSimpleEnv(props.env ?? {}),
            ports: props.ports.map((port) => ({
              containerPort: port,
            })),
            volumeMounts: [
              {
                mountPath: props.volumePath,
                name: name + "-data",
              },
            ],
          },
        ],
      },
      specExtra: {
        volumeClaimTemplates: [
          {
            metadata: {
              name: name + "-data",
            },
            spec: {
              accessModes: ["ReadWriteOnce"],
              resources: {
                requests: {
                  storage: props.volumeSize,
                },
              },
            },
          },
        ],
      },
    });
  }

  async helmChart(props: {
    name: string;
    remoteChart: string;
    values: object;
  }) {
    const { name, remoteChart, values } = props;
    const valuesYaml = stringify(values, {});
    const cmd = new Deno.Command("helm", {
      args: [
        "--kube-context",
        this.context,
        "--namespace",
        this.namespace,
        "upgrade",
        name,
        remoteChart,
        "--install",
        "--wait",
        "--values",
        "-",
      ],
      stdout: "inherit",
      stderr: "inherit",
      stdin: "piped",
    });
    const child = cmd.spawn();
    const writer = child.stdin.getWriter();
    await writer.write(new TextEncoder().encode(valuesYaml));
    await writer.close();
    console.log("waiting for helm upgrade to finish");
    const status = await child.status;
    console.log("helm upgrade finished");
    if (!status.success) {
      throw new Error(`helm upgrade failed with exit code ${status.code}`);
    }
  }
}
