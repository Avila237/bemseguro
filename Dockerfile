# ---- Stage 1: build do painel admin (React/Vite) ----
FROM node:20-alpine AS admin-build

WORKDIR /app

# Instala deps do admin (inclui devDeps: vite, tailwind) usando cache de layer
COPY package.json ./
COPY admin/package.json ./admin/
RUN cd admin && npm install

# Copia o codigo do admin e gera o build estatico em admin/dist
COPY admin/ ./admin/

# Variaveis VITE_ precisam existir em BUILD TIME: o Vite as embeda no bundle.
# No Railway, variaveis com prefixo VITE_ definidas no painel sao passadas como
# build args automaticamente quando ha um ARG correspondente aqui. Sem isto, o
# bundle sai sem a URL/key e o painel quebra com "supabaseUrl is required".
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

RUN npm run build:admin

# ---- Stage 2: runtime (API Express) ----
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

# Copia apenas o build estatico do admin gerado no stage anterior
COPY --from=admin-build /app/admin/dist ./admin/dist

EXPOSE 8080

CMD ["node", "src/index.js"]
