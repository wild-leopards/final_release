# Git Installation and Deployment Guide

## Step 1: Install Git

### Option A: Download from Official Website (Recommended)

1. **Download Git for Windows:**
   - Go to: https://git-scm.com/download/win
   - Click on "Download for Windows" button
   - Wait for the download to complete

2. **Install Git:**
   - Open the downloaded file (Git-2.xx.x-64-bit.exe)
   - Click "Next" through the installation wizard
   - **Important Settings:**
     - **Editor**: Select "Visual Studio Code" (or your preferred editor)
     - **Path Environment**: Select "Git from the command line and also from 3rd-party software"
     - **HTTPS transport backend**: Select "Use the native Windows Secure Channel library"
     - **Credential helper**: Select "Default (native) credential helper"
     - **Line ending conversions**: Select "Checkout Windows-style, commit Unix-style line endings"
     - **Terminal**: Select "Use Git from the command line and also from Windows Terminal"
   - Click "Next" then "Install"
   - Click "Finish" when complete

### Option B: Using Winget (if available)

```powershell
winget install Git.Git
```

### Option C: Using Chocolatey (if installed)

```powershell
choco install git
```

## Step 2: Verify Git Installation

Open a new PowerShell or Command Prompt window and run:

```powershell
git --version
```

You should see something like: `git version 2.xx.x`

## Step 3: Configure Git

```powershell
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

Replace with your actual name and email.

## Step 4: Create GitHub Repository

1. Go to https://github.com/new
2. Create a new repository:
   - Repository name: `energy-around-us`
   - Description: "Energy Around Us Hackathon Project - NASA POWER API Integration"
   - Choose Public or Private
   - **Important**: Uncheck "Add a README file"
   - Uncheck "Add .gitignore"
   - Uncheck "Choose a license"
3. Click "Create repository"
4. Copy the repository URL (e.g., `https://github.com/yourusername/energy-around-us.git`)

## Step 5: Initialize Git Repository and Push

Open PowerShell in your project directory:

```powershell
cd "C:\Users\save_\Desktop\GitHub\Project"
```

### Initialize Git Repository

```powershell
git init
```

### Add all files to staging

```powershell
git add .
```

### Commit the files

```powershell
git commit -m "Initial commit - NASA POWER API integration for Energy Around Us project"
```

### Add remote repository

Replace `YOUR_USERNAME` with your actual GitHub username:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/energy-around-us.git
```

### Push to GitHub

```powershell
git branch -M main
git push -u origin main
```

## Step 6: Verify Deployment

1. Go to https://github.com/YOUR_USERNAME/energy-around-us
2. You should see all your files listed
3. The repository should be public (if you chose public)

## Troubleshooting

### Git not found after installation

1. Close and reopen PowerShell or Command Prompt
2. Try: `refreshenv` (if you have the Environment Variables module)
3. Or restart your computer

### Authentication errors when pushing

1. When you run `git push`, GitHub will ask for authentication
2. Choose "GitHub.com" and click "Authenticate with web browser"
3. Sign in to GitHub when prompted
4. Allow GitHub Desktop or your browser to access your account

### Permission denied errors

1. Make sure you're using HTTPS, not SSH
2. Use: `git remote add origin https://github.com/YOUR_USERNAME/energy-around-us.git`
3. Not: `git remote add origin git@github.com:YOUR_USERNAME/energy-around-us.git`

## Alternative: Using GitHub Desktop

If you prefer a GUI approach:

1. Download GitHub Desktop from: https://desktop.github.com/
2. Install and sign in to GitHub
3. Click "Add existing repository"
4. Navigate to: `C:\Users\save_\Desktop\GitHub\Project`
5. Click "Add repository"
6. Add a commit message
7. Click "Push origin"

## Quick Commands Reference

```powershell
# Navigate to project directory
cd "C:\Users\save_\Desktop\GitHub\Project"

# Check git status
git status

# Add all files
git add .

# Commit changes
git commit -m "Your commit message"

# Check remote repository
git remote -v

# View commit history
git log

# Pull latest changes
git pull origin main

# Create a new branch
git checkout -b feature/new-feature

# Merge branch to main
git checkout main
git merge feature/new-feature
```

## Next Steps After Deployment

1. ✅ Your project is now on GitHub
2. ✅ Team members can clone the repository
3. ✅ You can track changes with git commits
4. ✅ You can collaborate with your team
5. ✅ You can create pull requests for code review

## Additional Resources

- **Git Documentation**: https://git-scm.com/doc
- **GitHub Guides**: https://guides.github.com/
- **Git Cheat Sheet**: https://education.github.com/git-cheat-sheet-education.pdf

---

**Installation Date**: 2025-06-23
**Project**: Energy Around Us Hackathon
**Status**: Ready for Git installation and deployment
