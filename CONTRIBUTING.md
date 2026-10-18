# Contributing to Auto MCQ Solver

Thanks for your interest in contributing! Here's how you can help:

## 🐛 Reporting Bugs

- Open an issue with the page URL (or a screenshot) where the extension failed to detect questions
- Include the browser console output (F12 → Console tab)

## 🔧 Adding Support for New Platforms

The extension uses 4 detection strategies in `content/content.js`. To add support for a new LMS or quiz platform:

1. Inspect the page structure (F12 → Elements tab)
2. Identify the CSS selectors for question containers and options
3. Add them to the appropriate strategy in `extractQuestions()`
4. Test with "📋 Extract Only" before solving

## 📝 Code Style

- Use vanilla JavaScript (no frameworks/build tools needed)
- Keep it simple — this is a browser extension, not a web app
- Comment any non-obvious detection logic

## 🧪 Testing

1. Load the extension in `chrome://extensions` (Developer Mode)
2. Navigate to a quiz page
3. Click "📋 Extract Only" and verify questions are detected in the console
4. Click "🧠 Solve Questions" and verify answers are selected

## 📄 License

By contributing, you agree your contributions will be licensed under the MIT License.
