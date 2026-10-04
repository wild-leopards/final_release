@echo off
REM Deployment Script for Energy Around Us Project
REM This script automates the Git initialization and push process

echo =========================================
echo Energy Around Us Project Deployment
echo =========================================
echo.

REM Check if Git is installed
where git >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Git is not installed. Please install Git first.
    echo.
    echo To install Git on Windows:
    echo 1. Download from: https://git-scm.com/download/win
    echo 2. Run the installer and follow the prompts
    echo 3. Restart your terminal after installation
    echo.
    pause
    exit /b 1
)

echo [OK] Git is installed: %git version%
echo.

REM Check if Git is configured
git config user.name >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Git is not configured. Please set your username and email.
    echo.
    set /p git_username="Enter your Git username: "
    git config --global user.name "%git_username%"
    echo.
    set /p git_email="Enter your Git email: "
    git config --global user.email "%git_email%"
    echo.
)

echo [OK] Git is configured
echo.

REM Check if we're in the right directory
if not exist "pom.xml" (
    echo [ERROR] pom.xml not found. Please run this script from the project directory.
    pause
    exit /b 1
)

echo [OK] Project directory verified
echo.

REM Initialize Git repository if not already initialized
if not exist ".git" (
    echo [INFO] Initializing Git repository...
    git init
    echo [OK] Git repository initialized
) else (
    echo [OK] Git repository already exists
)
echo.

REM Add all files to staging
echo [INFO] Adding files to Git...
git add .
echo [OK] Files added to staging
echo.

REM Create initial commit
echo [INFO] Creating initial commit...
git commit -m "Initial commit - NASA POWER API integration for Energy Around Us project"
echo [OK] Initial commit created
echo.

REM Check if remote repository is configured
git remote -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] GitHub repository URL not configured
    echo.
    echo Please follow these steps:
    echo 1. Create a new repository on GitHub: https://github.com/new
    echo 2. Copy the repository URL (e.g., https://github.com/yourusername/energy-around-us.git)
    echo 3. Run this script again and enter the repository URL
    echo.
    set /p github_url="Enter the GitHub repository URL: "
    git remote add origin "%github_url%"
    echo [OK] Remote repository configured
) else (
    echo [WARNING] Remote repository already configured
    echo Current remote:
    git remote -v
    echo.
    set /p update_remote="Do you want to update the remote repository? (y/N): "
    if /i "%update_remote%"=="y" (
        set /p github_url="Enter the new GitHub repository URL: "
        git remote set-url origin "%github_url%"
        echo [OK] Remote repository updated
    )
)
echo.

REM Set default branch to main
git branch -M main
echo [OK] Default branch set to 'main'
echo.

REM Push to GitHub
echo [INFO] Pushing to GitHub...
echo.
echo If this is your first push, you'll be asked to authenticate.
echo Choose 'GitHub.com' and authenticate with your web browser.
echo.

git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo =========================================
    echo [SUCCESS] Deployment Successful!
    echo =========================================
    echo.
    echo Your project is now available at:
    echo https://github.com/%git_username%/energy-around-us
    echo.
    echo Next steps:
    echo 1. Visit your GitHub repository
    echo 2. Share the link with your team
    echo 3. Start collaborating on your hackathon project
    echo.
) else (
    echo.
    echo =========================================
    echo [ERROR] Deployment Failed
    echo =========================================
    echo.
    echo Common issues:
    echo 1. Authentication failed - Make sure you're signed into GitHub
    echo 2. Repository URL is incorrect
    echo 3. Network connectivity issues
    echo.
    echo For help, see docs/backend/git-installation.md
    echo.
)

pause
