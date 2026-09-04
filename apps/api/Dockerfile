FROM node:24-alpine AS base
WORKDIR /app
# openssl: Prisma의 쿼리 엔진 바이너리가 Alpine 런타임에서 필요로 함 (없으면 libssl.so 관련 오류)
# ffmpeg: 영상 첨부의 대표 프레임 한 장을 뽑는 데만 쓴다 — 재인코딩은 하지 않는다.
#         없어도 앱은 동작한다 (포스터가 null이 되고 목록이 <video>로 되돌아간다).
RUN apk add --no-cache openssl ffmpeg

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build -w packages/shared
# prisma generate는 DB에 접속하지 않지만 prisma.config.ts가 DATABASE_URL을 요구하므로 더미 값을 준다.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npm run prisma:generate -w apps/api
RUN npm run build -w apps/api

FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
RUN mkdir -p /app/uploads
EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
