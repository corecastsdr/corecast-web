

-----

## How to Publish a New Version (Maintainer Guide)

Follow these steps to publish new versions of the packages (like `@corecast/headless` and `@corecast/ui`) to the public NPM registry.

### Step 1: Make Your Code Changes

Make all your code changes in the correct package (e.g., `packages/headless/src/index.ts`).

### Step 2: Commit Your Changes

Commit your feature, bugfix, or chore as you normally would.

```bash
# Add all your changes
git add .

# Commit with a clear message
git commit -m "feat: Add new hook to headless package"
```

### Step 3: Add a Changeset

This is the most important step for versioning. From the **root** of the project, run:

```bash
npx changeset add
```

This will start an interactive tool:

1.  It will ask you which packages you want to release. Use the **arrow keys** to move and **spacebar** to select the packages you just changed (e.g., `@corecast/headless`).
2.  It will ask you what type of version bump it is (`patch`, `minor`, or `major`).
3.  It will ask for a summary. **Write a clear message here,** as this will be automatically added to the `CHANGELOG.md` file.

### Step 4: Build and Version the Packages

Run the `release` script from the **root** of the project.

```bash
npm run release
```

> **What this command does:**
>
> 1.  **`turbo run build`**: This correctly runs the `build` script (like `tsup ...`) inside *all* your packages, creating the up-to-date `dist` folders.
> 2.  **`changeset version`**: This finds the changeset file you just made, deletes it, and automatically updates the `version` in your `package.json` files and writes your summary into the `CHANGELOG.md` files.

### Step 5: Commit the Version Bump

`changeset` has just changed a lot of files (`package.json`, `CHANGELOG.md`). You **must** commit these changes.

```bash
# Add all the changed package.json and changelog files
git add .

# Commit with a standard message
git commit -m "chore: Bump package versions"
```

### Step 6: Push to GitHub

Push your feature commit *and* your version bump commit to the remote repository.

```bash
git push origin main
```

### Step 7: Publish to NPM

This is the final step. This will publish only the packages that have a new version number.

1.  **First, check that you are logged in to NPM:**
    ```bash
    npm whoami
    ```
2.  **If that command fails or shows the wrong user, log in:**
    ```bash
    npm login
    ```
3.  **Now, publish:**
    ```bash
    npx changeset publish
    ```

That's it\! `changeset` will find all packages that need to be published, upload them to NPM, and create `git` tags for the new versions.
## ⚖️ License

Copyright (c) 2025-Present Core Cast.

This project is licensed under the **PolyForm Noncommercial License 1.0.0**.

This means it is free to use, modify, and distribute for **non-commercial purposes only**. You may not use this software for any commercial purposes.

See the `LICENSE.md` file for the full text.
