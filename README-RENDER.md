# V25.9.5 Render 배포용
GitHub에는 이 폴더 **안의 파일과 폴더**를 저장소 최상위에 올립니다.

Render:
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment: `OPENAI_API_KEY`를 Render에서만 등록
- Health: `/api/health`

주의: `.env`, API 키, node_modules는 GitHub에 올리지 않습니다.
