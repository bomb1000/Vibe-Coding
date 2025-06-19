# How to Set Up GitHub Pages for Your Repository

This guide provides step-by-step instructions to deploy your project as a live website using GitHub Pages.

## Instructions

1.  **Navigate to Repository Settings:**
    *   Go to the main page of your repository on GitHub (e.g., `https://github.com/username/repositoryname`).
    *   Click on the "Settings" tab, usually located near the top right of the repository's navigation bar.

2.  **Select Pages Section:**
    *   In the left sidebar of the Settings page, scroll down and click on "Pages" under the "Code and automation" section.

3.  **Choose a Source for Deployment:**
    *   Under the "Build and deployment" section, find the "Source" option.
    *   Select "Deploy from a branch". This is the most common method for simple static sites.

4.  **Configure the Branch and Folder:**
    *   **Branch:**
        *   From the dropdown menu under "Branch", select the branch you want to deploy. This is typically `main` or `master`. If you have created a specific branch for deployment (like `gh-pages`), choose that one.
    *   **Folder:**
        *   Next to the branch selection, you'll see a dropdown for selecting a folder. This is usually `/(root)`.
        *   **Important:** The folder you select here should contain your site's main `index.html` file.
            *   If your `index.html` is at the very root of the branch you selected, choose `/(root)`.
            *   If your `index.html` is inside a folder (e.g., `/docs` or `/FinancialNewsAggregator` in your case), you would select that folder.

5.  **Save Changes:**
    *   After selecting your branch and folder, click the "Save" button next to the folder selection.

6.  **Wait for Deployment:**
    *   GitHub Pages will now start the build and deployment process for your site. This might take a few minutes. You can sometimes see the progress or status updates on this same page.

7.  **Access Your Live Site:**
    *   Once the deployment is complete, the URL for your live site (e.g., `https://username.github.io/repositoryname/`) will be displayed at the top of the GitHub Pages settings section. Click this link to visit your site.
    *   It might take a few more minutes after deployment for the site to become accessible or for the latest changes to reflect due to caching.

## Important Notes for Your Project Structure

Your project's main HTML file (`index.html`) is currently located in the `FinancialNewsAggregator` folder. This affects how your site will be served and what URL it will have. Here are your options:

*   **Option A: Deploying from a subfolder (e.g., `FinancialNewsAggregator` on `main` branch):**
    *   If you select your `main` branch and the `/(root)` folder, your site will be available at `https://username.github.io/repositoryname/`. However, for this to work, your `index.html` needs to be at the root of your repository.
    *   If you select your `main` branch and the `/FinancialNewsAggregator` folder (if GitHub Pages UI allows this for your setup), your site *might* be available directly at `https://username.github.io/repositoryname/`. This depends on GitHub's current handling of subfolder deployments.
    *   More commonly, if you deploy the `main` branch from `/(root)` and your files are in `FinancialNewsAggregator/`, your site will be accessible at: `https://username.github.io/repositoryname/FinancialNewsAggregator/`.

*   **Option B: Moving files to the root of your deployment branch:**
    *   To get a cleaner URL like `https://username.github.io/repositoryname/`, you can move the contents of your `FinancialNewsAggregator` folder (i.e., `index.html`, `style.css`, `script.js`, and any other assets) to the root of the branch you are deploying (e.g., the `main` branch).
    *   If you do this, you would select `/(root)` as the folder in the GitHub Pages settings.

*   **Option C: Using a dedicated `gh-pages` branch (Recommended for cleaner project structure):**
    1.  Create a new branch named `gh-pages` from your `main` branch.
    2.  In this `gh-pages` branch, move all the files and folders currently inside `FinancialNewsAggregator` (i.e., `index.html`, `style.css`, `script.js`) to the root of the `gh-pages` branch. So, `gh-pages` branch would have `index.html`, `style.css`, etc., at its top level.
    3.  Push the `gh-pages` branch to GitHub.
    4.  In GitHub Pages settings, select `gh-pages` as your source branch and `/(root)` as the folder.
    5.  Your site will then be available at `https://username.github.io/repositoryname/`.
    *   This method keeps your project's source code in `main` nicely organized within the `FinancialNewsAggregator` folder, while the `gh-pages` branch is structured specifically for deployment.

**Recommendation:**
Consider **Option C** (using a `gh-pages` branch) for the best separation of concerns and a clean site URL. If you prefer simplicity for now and don't mind the longer URL, deploying the `main` branch and accessing your site via the `FinancialNewsAggregator/` sub-path (as in the latter part of Option A) is also viable.

Choose the option that best suits your workflow. After setting up, if you encounter any issues, double-check your selected branch, folder, and the location of your `index.html` file.
