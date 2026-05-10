# syntax=docker/dockerfile:1.7

ARG ML_BASE_IMAGE=ai-review-ml-base:latest

# Builder stage: contains compilers/package managers only while installing deps.
FROM ${ML_BASE_IMAGE} AS builder

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=1000 \
    PIP_RETRIES=10 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CUDA_VISIBLE_DEVICES="" \
    TORCH_CUDA_ARCH_LIST="" \
    FORCE_CUDA=0 \
    GEM_HOME=/opt/ruby-gems \
    GEM_PATH=/opt/ruby-gems

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        build-essential \
        nodejs \
        npm \
        ruby \
        ruby-dev

# JavaScript/CSS static-analysis tools, installed outside the system prefix so
# only the tool payload is copied to the runtime image.
RUN --mount=type=cache,target=/root/.npm \
    npm install -g --prefix /opt/node-tools \
        eslint@^8 \
        @eslint/js \
        stylelint \
        stylelint-config-standard \
    && npm cache clean --force

# Ruby static-analysis tools.
RUN --mount=type=cache,target=/root/.gem \
    gem install rubocop --no-document

# Go staticcheck.
RUN mkdir -p /opt/staticcheck/bin \
    && curl -sSfL \
        https://github.com/dominikh/go-tools/releases/latest/download/staticcheck_linux_amd64.tar.gz \
    | tar -xzf - -C /opt/staticcheck/bin --strip-components=1 staticcheck/staticcheck \
    && chmod +x /opt/staticcheck/bin/staticcheck

COPY requirements.txt /app/

# Install Python runtime dependencies into /opt/python-deps. Heavy ML packages
# are supplied by ML_BASE_IMAGE, and CUDA-only packages are intentionally
# excluded to keep this image CPU-only and avoid multi-GB nvidia layers.
RUN --mount=type=cache,target=/root/.cache/pip \
    grep -vE "^(torch==|torchvision==|torchaudio==|sentence-transformers==|transformers==|cuda-|nvidia-|triton==)" requirements.txt \
        > /tmp/requirements-runtime.txt \
    && pip install --prefix=/opt/python-deps -r /tmp/requirements-runtime.txt \
    && find /opt/python-deps -type d -name "__pycache__" -prune -exec rm -rf {} + \
    && find /opt/python-deps -type f -name "*.pyc" -delete


# Runtime stage: keeps the complete app/tooling, but drops compilers, npm,
# ruby-dev, build headers and installer caches.
FROM ${ML_BASE_IMAGE} AS runtime

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DEFAULT_TIMEOUT=1000 \
    PIP_RETRIES=10 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    CUDA_VISIBLE_DEVICES="" \
    TORCH_CUDA_ARCH_LIST="" \
    FORCE_CUDA=0 \
    PYTHONPATH="/opt/python-deps/lib/python3.11/site-packages" \
    GEM_HOME=/opt/ruby-gems \
    GEM_PATH=/opt/ruby-gems \
    NODE_PATH=/opt/node-tools/lib/node_modules \
    PATH="/opt/python-deps/bin:/opt/node-tools/bin:/opt/ruby-gems/bin:/opt/staticcheck/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin"

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        git \
        curl \
        nodejs \
        ruby \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /opt/python-deps /opt/python-deps
COPY --from=builder /opt/node-tools /opt/node-tools
COPY --from=builder /opt/ruby-gems /opt/ruby-gems
COPY --from=builder /opt/staticcheck /opt/staticcheck

COPY . /app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
