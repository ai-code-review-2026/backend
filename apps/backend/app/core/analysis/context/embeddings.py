"""
Embedding Generator - Converts code chunks to vectors

Supports multiple embedding models:
- sentence-transformers/all-MiniLM-L6-v2 (lightweight, fast, 384 dims)
- microsoft/codebert-base (code-specific, 768 dims)
- OpenAI text-embedding-3-small (production, 1536 dims)
- OpenAI text-embedding-3-large (high-quality, 3072 dims)

Design: Batch processing, caching, model switching, async processing
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from enum import Enum
from typing import Any, Optional

import numpy as np
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class EmbeddingProvider(str, Enum):
    """Available embedding providers."""
    SENTENCE_TRANSFORMERS = "sentence_transformers"
    OPENAI = "openai"
    CODEBERT = "codebert"


class EmbeddingModel(BaseModel):
    """Embedding model configuration."""
    provider: EmbeddingProvider
    model_name: str
    dimension: int
    batch_size: int = 32
    normalize: bool = True


class EmbeddingCache:
    """In-memory cache for embeddings to avoid recomputation."""
    
    def __init__(self, max_size: int = 10000):
        self._cache: dict[str, list[float]] = {}
        self._max_size = max_size
        self._access_count: dict[str, int] = {}
    
    def _get_key(self, text: str, model_name: str) -> str:
        """Generate cache key from text and model."""
        content = f"{model_name}:{text}"
        return hashlib.sha256(content.encode()).hexdigest()
    
    def get(self, text: str, model_name: str) -> Optional[list[float]]:
        """Retrieve embedding from cache."""
        key = self._get_key(text, model_name)
        if key in self._cache:
            self._access_count[key] = self._access_count.get(key, 0) + 1
            return self._cache[key]
        return None
    
    def put(self, text: str, model_name: str, embedding: list[float]) -> None:
        """Store embedding in cache with LRU eviction."""
        key = self._get_key(text, model_name)
        
        # Evict least accessed if cache is full
        if len(self._cache) >= self._max_size:
            lru_key = min(self._access_count, key=self._access_count.get)
            del self._cache[lru_key]
            del self._access_count[lru_key]
        
        self._cache[key] = embedding
        self._access_count[key] = 1
    
    def clear(self) -> None:
        """Clear all cached embeddings."""
        self._cache.clear()
        self._access_count.clear()


class EmbeddingGenerator:
    """
    Generate embeddings for code chunks with multiple provider support.
    
    Features:
    - Multiple embedding models (sentence-transformers, OpenAI, CodeBERT)
    - Batch processing for efficiency
    - In-memory caching to avoid recomputation
    - Async processing for OpenAI API
    - Automatic normalization
    
    Usage:
        generator = EmbeddingGenerator(
            provider=EmbeddingProvider.SENTENCE_TRANSFORMERS,
            model_name="all-MiniLM-L6-v2"
        )
        embeddings = await generator.embed_texts(["code chunk 1", "code chunk 2"])
    """
    
    def __init__(
        self,
        provider: EmbeddingProvider = EmbeddingProvider.SENTENCE_TRANSFORMERS,
        model_name: str = "all-MiniLM-L6-v2",
        batch_size: int = 32,
        use_cache: bool = True,
        openai_api_key: Optional[str] = None,
    ):
        self.provider = provider
        self.model_name = model_name
        self.batch_size = batch_size
        self.use_cache = use_cache
        self.cache = EmbeddingCache() if use_cache else None
        
        # Initialize the appropriate model
        self._model = None
        self._tokenizer = None
        self._openai_client = None
        
        if provider == EmbeddingProvider.SENTENCE_TRANSFORMERS:
            self._init_sentence_transformers()
        elif provider == EmbeddingProvider.CODEBERT:
            self._init_codebert()
        elif provider == EmbeddingProvider.OPENAI:
            self._init_openai(openai_api_key)
        
        logger.info(
            f"Initialized EmbeddingGenerator: provider={provider}, "
            f"model={model_name}, batch_size={batch_size}"
        )
    
    def _init_sentence_transformers(self) -> None:
        """Initialize sentence-transformers model."""
        try:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)
            logger.info(f"Loaded sentence-transformers model: {self.model_name}")
        except ImportError:
            logger.error(
                "sentence-transformers not installed. "
                "Install with: pip install sentence-transformers"
            )
            raise
    
    def _init_codebert(self) -> None:
        """Initialize CodeBERT model."""
        try:
            from transformers import AutoTokenizer, AutoModel
            self._tokenizer = AutoTokenizer.from_pretrained(
                f"microsoft/{self.model_name}"
            )
            self._model = AutoModel.from_pretrained(
                f"microsoft/{self.model_name}"
            )
            logger.info(f"Loaded CodeBERT model: {self.model_name}")
        except ImportError:
            logger.error(
                "transformers not installed. "
                "Install with: pip install transformers torch"
            )
            raise
    
    def _init_openai(self, api_key: Optional[str]) -> None:
        """Initialize OpenAI client."""
        try:
            from openai import AsyncOpenAI
            self._openai_client = AsyncOpenAI(api_key=api_key)
            logger.info(f"Initialized OpenAI client for model: {self.model_name}")
        except ImportError:
            logger.error(
                "openai not installed. Install with: pip install openai"
            )
            raise
    
    async def embed_texts(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for a list of texts.
        
        Args:
            texts: List of text strings to embed
            
        Returns:
            List of embedding vectors (each is a list of floats)
        """
        if not texts:
            return []
        
        # Check cache first
        embeddings: list[Optional[list[float]]] = []
        texts_to_embed: list[tuple[int, str]] = []
        
        if self.use_cache and self.cache:
            for idx, text in enumerate(texts):
                cached = self.cache.get(text, self.model_name)
                if cached is not None:
                    embeddings.append(cached)
                else:
                    embeddings.append(None)
                    texts_to_embed.append((idx, text))
        else:
            embeddings = [None] * len(texts)
            texts_to_embed = list(enumerate(texts))
        
        # Generate embeddings for uncached texts
        if texts_to_embed:
            logger.info(
                f"Generating embeddings for {len(texts_to_embed)}/{len(texts)} texts"
            )
            
            if self.provider == EmbeddingProvider.OPENAI:
                new_embeddings = await self._embed_openai(
                    [text for _, text in texts_to_embed]
                )
            elif self.provider == EmbeddingProvider.SENTENCE_TRANSFORMERS:
                new_embeddings = await self._embed_sentence_transformers(
                    [text for _, text in texts_to_embed]
                )
            elif self.provider == EmbeddingProvider.CODEBERT:
                new_embeddings = await self._embed_codebert(
                    [text for _, text in texts_to_embed]
                )
            else:
                raise ValueError(f"Unknown provider: {self.provider}")
            
            # Store in cache and results
            for (idx, text), embedding in zip(texts_to_embed, new_embeddings):
                embeddings[idx] = embedding
                if self.use_cache and self.cache:
                    self.cache.put(text, self.model_name, embedding)
        
        return [e for e in embeddings if e is not None]
    
    async def _embed_sentence_transformers(
        self, texts: list[str]
    ) -> list[list[float]]:
        """Generate embeddings using sentence-transformers."""
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        embeddings = await loop.run_in_executor(
            None,
            lambda: self._model.encode(
                texts,
                batch_size=self.batch_size,
                show_progress_bar=False,
                normalize_embeddings=True,
            )
        )
        return embeddings.tolist()
    
    async def _embed_codebert(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings using CodeBERT."""
        import torch
        
        def _encode_batch(batch_texts: list[str]) -> np.ndarray:
            inputs = self._tokenizer(
                batch_texts,
                padding=True,
                truncation=True,
                max_length=512,
                return_tensors="pt",
            )
            
            with torch.no_grad():
                outputs = self._model(**inputs)
            
            # Use [CLS] token embedding as sentence embedding
            embeddings = outputs.last_hidden_state[:, 0, :].numpy()
            
            # Normalize if needed
            norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
            embeddings = embeddings / (norms + 1e-8)
            
            return embeddings
        
        # Process in batches
        all_embeddings = []
        loop = asyncio.get_event_loop()
        
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i:i + self.batch_size]
            embeddings = await loop.run_in_executor(None, _encode_batch, batch)
            all_embeddings.append(embeddings)
        
        return np.vstack(all_embeddings).tolist()
    
    async def _embed_openai(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings using OpenAI API."""
        all_embeddings = []
        
        # Process in batches (OpenAI allows up to 2048 inputs per request)
        api_batch_size = min(self.batch_size, 2048)
        
        for i in range(0, len(texts), api_batch_size):
            batch = texts[i:i + api_batch_size]
            
            try:
                response = await self._openai_client.embeddings.create(
                    model=self.model_name,
                    input=batch,
                )
                
                batch_embeddings = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embeddings)
                
            except Exception as e:
                logger.error(f"OpenAI embedding error for batch {i}: {e}")
                # Return zero vectors as fallback
                dimension = 1536 if "small" in self.model_name else 3072
                all_embeddings.extend([[0.0] * dimension] * len(batch))
        
        return all_embeddings
    
    async def embed_chunks(self, chunks: list[Any]) -> list[list[float]]:
        """
        Generate embeddings for code chunks.
        
        Args:
            chunks: List of CodeChunk objects with 'content' attribute
            
        Returns:
            List of embedding vectors
        """
        # Extract text content from chunks
        texts = []
        for chunk in chunks:
            if hasattr(chunk, "content"):
                texts.append(chunk.content)
            elif isinstance(chunk, dict) and "content" in chunk:
                texts.append(chunk["content"])
            elif isinstance(chunk, str):
                texts.append(chunk)
            else:
                logger.warning(f"Unknown chunk format: {type(chunk)}")
                texts.append(str(chunk))
        
        return await self.embed_texts(texts)
    
    def clear_cache(self) -> None:
        """Clear the embedding cache."""
        if self.cache:
            self.cache.clear()
            logger.info("Embedding cache cleared")
    
    @property
    def embedding_dimension(self) -> int:
        """Get the dimension of embeddings produced by this generator."""
        if self.provider == EmbeddingProvider.SENTENCE_TRANSFORMERS:
            if "MiniLM" in self.model_name:
                return 384
            elif "mpnet" in self.model_name:
                return 768
            return 768  # Default
        elif self.provider == EmbeddingProvider.CODEBERT:
            return 768
        elif self.provider == EmbeddingProvider.OPENAI:
            if "small" in self.model_name:
                return 1536
            elif "large" in self.model_name:
                return 3072
            return 1536  # Default
        return 768  # Fallback
