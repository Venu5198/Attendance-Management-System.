# Local Development & Testing Guide

## Prerequisites
- Python 3.12+ (or Python 3.14)
- Node.js 18+ and npm
- MongoDB 6+ running locally (or via Docker Compose)

## Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd "C:\devops\Attendance management\backend"
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Run FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   API Documentation available at: `http://localhost:8000/docs`

5. Run test suite:
   ```bash
   pytest -v --cov=app tests/
   ```

## Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd "C:\devops\Attendance management\frontend"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start Vite dev server:
   ```bash
   npm run dev
   ```
   Dashboard opens at: `http://localhost:5173`

4. Build production bundle:
   ```bash
   npm run build
   ```

## Docker Deployment

To spin up the entire backend and MongoDB stack via Docker Compose:
```bash
cd "C:\devops\Attendance management\backend"
docker compose up -d --build
```