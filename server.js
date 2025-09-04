import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const app = express();
app.use(bodyParser.json());
import cors from "cors";

app.use(cors());
app.options("*", cors());

app.post("/deploy", async (req, res) => {
  try {
    const {
      repo_url,
      commit_id,
      liquibase_exec_cmd,
      liquibase_envs,
      env_filename,
    } = req.body;

    if (!repo_url || !liquibase_exec_cmd || !env_filename) {
      return res.status(400).json({ message: "Missing required input(s)" });
    }

    // --- Build clone URL with PAT ---
    const patToken = process.env.PAT_TOKEN;
    if (!patToken) {
      return res
        .status(500)
        .json({ message: "PAT_TOKEN not set in environment" });
    }
    let authRepoUrl = repo_url;
    if (repo_url.startsWith("https://")) {
      const parts = repo_url.split("https://");
      authRepoUrl = `https://${patToken}@${parts[1]}`;
    }

    // --- Build Kubernetes Job YAML dynamically ---
    const jobName = `deploy-job-${Date.now()}`;
    const workdir = "/tmp/workdir";
    // --- Base64 encode JSON env variables ---
    const envVarsBase64 = Buffer.from(
      JSON.stringify(liquibase_envs || {})
    ).toString("base64");

    const jobYaml = `
apiVersion: batch/v1
kind: Job
metadata:
  name: ${jobName}
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: deploy-runner
          image: deploy-runner:latest
          imagePullPolicy: Never
          env:
            - name: REPO_URL
              value: "${authRepoUrl}"
            - name: COMMIT_ID
              value: "${commit_id || ""}"
            - name: EXEC_CMD
              value: "${liquibase_exec_cmd.replace(/"/g, '\\"')}"
            - name: ENV_FILENAME
              value: "${env_filename}"
            - name: ENV_VARS_JSON
              value: "${envVarsBase64}"
            - name: WORKDIR
              value: "${workdir}"
          command: ["/bin/bash", "/usr/local/bin/deploy.sh"]
`;

    // --- Write YAML to temp file ---
    const tmpFile = path.join(os.tmpdir(), `${jobName}.yaml`);
    fs.writeFileSync(tmpFile, jobYaml);

    // --- Apply Job ---
    const { stdout, stderr } = await execAsync(`kubectl apply -f ${tmpFile}`);

    return res.status(200).json({ job: jobName, stdout, stderr });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.get("/job/:name/latest-pod", async (req, res) => {
  try {
    const jobName = req.params.name;
    if (!jobName) {
      return res.status(400).json({ message: "Job name is required" });
    }

    // Get pods for this job in JSON
    const { stdout, stderr } = await execAsync(
      `kubectl get pods --selector=job-name=${jobName} -o json`
    );

    if (stderr) {
      return res.status(500).json({ error: stderr });
    }

    const pods = JSON.parse(stdout).items;
    if (pods.length === 0) {
      return res.status(404).json({ message: "No pods found for this Job" });
    }

    // Sort pods by creationTimestamp descending (latest first)
    pods.sort(
      (a, b) =>
        new Date(b.metadata.creationTimestamp) -
        new Date(a.metadata.creationTimestamp)
    );

    const latestPod = pods[0];
    const podDetails = {
      name: latestPod.metadata.name,
      phase: latestPod.status.phase,
      startTime: latestPod.status.startTime,
      completionTime:
        latestPod.status.containerStatuses?.[0]?.state?.terminated?.finishedAt,
      containerStatus: latestPod.status.containerStatuses?.[0]?.state,
    };

    return res.status(200).json({ jobName, latestPod: podDetails });
  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
