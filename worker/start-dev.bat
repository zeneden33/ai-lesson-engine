@echo off
cd /d "D:\Educational Encyclopedia\Arabic\Ai\Laptop\تحدث\template\Template\English version\lesson v0.2\ai-lesson-engine\worker"
npx wrangler dev --env dev --port 8792 > wrangler-stdout.log 2> wrangler-stderr.log
