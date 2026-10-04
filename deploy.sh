#!/bin/bash
# Deployment Script for Energy Around Us Project
# This script automates the Git initialization and push process

echo "========================================="
echo "Energy Around Us Project Deployment"
echo "========================================="
echo ""

# Check if Git is installed
if ! command -v git &> /dev/null
then
    echo "❌ Git is not installed. Please install Git first."
    echo "   See docs/backend/git-installation.md for instructions."
    echo ""
    echo "To install Git on Windows:"
    echo "1. Download from: https://git-scm.com/download/win"
    echo "2. Run the installer and follow the prompts"
    echo "3. Restart your terminal after installation"
    echo ""
    exit 1
fi

echo "✅ Git is installed: $(git --version)"
echo ""

# Check if Git is configured
if ! git config user.name &> /dev/null
then
    echo "⚠️  Git is not configured. Please set your username and email:"
    echo ""
    read -p "Enter your Git username: " git_username
    git config --global user.name "$git_username"
    echo ""
    read -p "Enter your Git email: " git_email
    git config --global user.email "$git_email"
    echo ""
fi

echo "✅ Git is configured"
echo ""

# Check if we're in the right directory
if [ ! -f "pom.xml" ]; then
    echo "❌ pom.xml not found. Please run this script from the project directory."
    exit 1
fi

echo "✅ Project directory verified"
echo ""

# Initialize Git repository if not already initialized
if [ ! -d ".git" ]; then
    echo "🔄 Initializing Git repository..."
    git init
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already exists"
fi
echo ""

# Add all files to staging
echo "🔄 Adding files to Git..."
git add .
echo "✅ Files added to staging"
echo ""

# Create initial commit
echo "🔄 Creating initial commit..."
git commit -m "Initial commit - NASA POWER API integration for Energy Around Us project"
echo "✅ Initial commit created"
echo ""

# Check if remote repository is configured
if git remote -v | grep -q "origin"; then
    echo "⚠️  Remote repository already configured"
    echo "   Current remote:"
    git remote -v
    echo ""
    read -p "Do you want to update the remote repository? (y/N): " update_remote
    if [ "$update_remote" = "y" ] || [ "$update_remote" = "Y" ]; then
        read -p "Enter the new GitHub repository URL: " new_remote
        git remote set-url origin "$new_remote"
        echo "✅ Remote repository updated"
    fi
else
    echo "📝 GitHub repository URL not configured"
    echo ""
    echo "Please follow these steps:"
    echo "1. Create a new repository on GitHub: https://github.com/new"
    echo "2. Copy the repository URL (e.g., https://github.com/yourusername/energy-around-us.git)"
    echo "3. Run this script again and enter the repository URL"
    echo ""
    read -p "Enter the GitHub repository URL: " github_url
    git remote add origin "$github_url"
    echo "✅ Remote repository configured"
fi
echo ""

# Set default branch to main
git branch -M main
echo "✅ Default branch set to 'main'"
echo ""

# Push to GitHub
echo "🚀 Pushing to GitHub..."
echo ""
echo "If this is your first push, you'll be asked to authenticate."
echo "Choose 'GitHub.com' and authenticate with your web browser."
echo ""

git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "✅ Deployment Successful!"
    echo "========================================="
    echo ""
    echo "Your project is now available at:"
    echo "https://github.com/$(git config user.name)/energy-around-us"
    echo ""
    echo "Next steps:"
    echo "1. Visit your GitHub repository"
    echo "2. Share the link with your team"
    echo "3. Start collaborating on your hackathon project"
    echo ""
else
    echo ""
    echo "========================================="
    echo "❌ Deployment Failed"
    echo "========================================="
    echo ""
    echo "Common issues:"
    echo "1. Authentication failed - Make sure you're signed into GitHub"
    echo "2. Repository URL is incorrect"
    echo "3. Network connectivity issues"
    echo ""
    echo "For help, see docs/backend/git-installation.md"
    echo ""
    exit 1
fi
