# MyNotes — k3s Deployment Guide

This directory contains Kubernetes manifests for deploying MyNotes on a k3s cluster. The configuration is optimised for **Raspberry Pi 3B** (ARMv7, 1 GB RAM) but works equally well on any k3s node.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| k3s | v1.28+ | Includes Traefik ingress and local-path provisioner |
| kubectl | v1.28+ | Configured to point at your k3s cluster |
| Docker + Buildx | 24+ | Required to build the ARM image |
| Container registry | Any | Docker Hub, GHCR, or a local registry |

---

## 1. Install k3s on Raspberry Pi 3B

```bash
# On the Raspberry Pi (SSH in first)
curl -sfL https://get.k3s.io | sh -

# Wait for k3s to be ready
sudo k3s kubectl get nodes

# Copy the kubeconfig to your workstation
scp pi@raspberrypi.local:/etc/rancher/k3s/k3s.yaml ~/.kube/config
# Edit the server URL in ~/.kube/config to point to your Pi's IP
sed -i 's/127.0.0.1/YOUR_PI_IP/g' ~/.kube/config
```

> **Tip:** Enable cgroup memory on the Pi by adding `cgroup_memory=1 cgroup_enable=memory` to `/boot/cmdline.txt` and rebooting before installing k3s.

---

## 2. Build and Push the ARM Image

```bash
# Enable multi-platform builds (once per machine)
docker buildx create --use --name mybuilder

# Build for Raspberry Pi 3B (linux/arm/v7)
docker buildx build \
  --platform linux/arm/v7 \
  -t YOUR_REGISTRY/mynotes:latest \
  --push \
  ../../

# Replace YOUR_REGISTRY with your Docker Hub username, GHCR namespace, etc.
# Example: ghcr.io/nzicecool/mynotes:latest
```

Update the `image:` field in `03-app.yaml` with your registry path.

---

## 3. Configure Secrets

Edit `01-secrets.yaml` and replace all placeholder base64 values:

```bash
# Generate base64 values
echo -n "mysql://mynotes:YOUR_PASS@mynotes-mysql:3306/mynotes" | base64
echo -n "your_jwt_secret_at_least_32_chars"                     | base64
echo -n "your_mysql_root_password"                              | base64
echo -n "your_mysql_app_password"                               | base64

# If using AgentMail.to:
echo -n "am_your_agentmail_api_key"                             | base64
```

> **Security note:** For production, use [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) or the [External Secrets Operator](https://external-secrets.io) instead of plain Kubernetes Secrets.

---

## 4. Deploy

```bash
# Apply all manifests in order
kubectl apply -f 00-namespace.yaml
kubectl apply -f 01-secrets.yaml    -n mynotes
kubectl apply -f 02-mysql.yaml      -n mynotes
kubectl apply -f 03-app.yaml        -n mynotes
kubectl apply -f 04-ingress.yaml    -n mynotes

# Watch the rollout
kubectl rollout status deployment/mynotes-app -n mynotes

# Check all pods are Running
kubectl get pods -n mynotes
```

---

## 5. Run Database Migrations

After the app pod is running, execute the schema migration:

```bash
# Get the app pod name
POD=$(kubectl get pod -n mynotes -l app=mynotes-app -o jsonpath='{.items[0].metadata.name}')

# Run migrations
kubectl exec -n mynotes $POD -- node -e "
  const { execSync } = require('child_process');
  execSync('pnpm db:push', { stdio: 'inherit' });
"
```

---

## 6. Access the Application

Add the following to `/etc/hosts` on any machine on your local network:

```
YOUR_PI_IP  mynotes.local
```

Then open `http://mynotes.local` in your browser.

---

## Resource Usage on Raspberry Pi 3B

| Component | Memory Request | Memory Limit | CPU Limit |
|---|---|---|---|
| mynotes-app | 128 Mi | 384 Mi | 800m |
| mynotes-mysql | 256 Mi | 512 Mi | 500m |
| k3s system | ~200 Mi | — | — |
| **Total** | **~584 Mi** | **~1096 Mi** | — |

The Pi 3B has 1 GB of RAM. The above configuration leaves ~400 MB headroom for the OS and k3s system components. Avoid running other workloads on the same node.

---

## Useful Commands

```bash
# View logs
kubectl logs -n mynotes -l app=mynotes-app -f
kubectl logs -n mynotes -l app=mynotes-mysql -f

# Restart the app (e.g. after updating a secret)
kubectl rollout restart deployment/mynotes-app -n mynotes

# Scale down (to save resources when not in use)
kubectl scale deployment mynotes-app -n mynotes --replicas=0

# Delete everything (keeps PVC data)
kubectl delete -f . -n mynotes

# Delete everything including data (DESTRUCTIVE)
kubectl delete namespace mynotes
```

---

## Upgrading

```bash
# Build and push a new image
docker buildx build --platform linux/arm/v7 \
  -t YOUR_REGISTRY/mynotes:v1.1.0 --push ../../

# Update the image tag in 03-app.yaml, then apply
kubectl apply -f 03-app.yaml -n mynotes
kubectl rollout status deployment/mynotes-app -n mynotes
```
