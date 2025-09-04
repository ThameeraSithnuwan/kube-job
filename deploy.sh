#!/bin/bash
set -e

echo "=== Deploy Script Started ==="
echo "REPO_URL: $REPO_URL"
echo "COMMIT_ID: $COMMIT_ID"
echo "EXEC_CMD: $EXEC_CMD"
echo "ENV_FILENAME: $ENV_FILENAME"
echo "WORKDIR: $WORKDIR"

# Clone repo
echo "Cloning from: $REPO_URL"
git clone "$REPO_URL" "$WORKDIR/repo"

# Checkout specific commit if provided
if [ -n "$COMMIT_ID" ]; then
  echo "Checking out commit: $COMMIT_ID"
  cd "$WORKDIR/repo"
  git checkout "$COMMIT_ID"
fi

# Create env file
ENV_FILE="$WORKDIR/repo/$ENV_FILENAME"
echo "#!/bin/bash" > "$ENV_FILE"

# Decode JSON and generate env file
echo "$ENV_VARS_JSON" | base64 --decode > "$WORKDIR/repo/env.json"
jq -r 'to_entries[] | "\(.key)=\"\(.value)\""' "$WORKDIR/repo/env.json" >> "$ENV_FILE"
chmod +x "$ENV_FILE"
echo "Created env file: $ENV_FILE"

# Navigate to repo root
cd "$WORKDIR/repo"

echo "=== List Working Directory ==="
ls -la
echo "=== List Working Directory ==="

# Run the liquibase command
echo "Running command: $EXEC_CMD"
bash -c "$EXEC_CMD"


echo "=== Deploy Script Completed ==="
