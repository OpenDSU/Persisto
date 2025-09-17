# Persisto Project Description

## Overview

Persisto is a generic and pluggable persistence library for Node.js. It provides a straightforward way to store, retrieve, and manage data for applications, with a focus on flexibility and ease of use. The library is designed to be extensible, allowing different storage strategies to be plugged in as needed. The default strategy is a simple file-system-based storage.

Persisto also includes a server component that exposes the persistence layer as a REST API, and a client library for interacting with the server. This allows for a decoupled architecture where the persistence layer can be run as a separate service.

## Core Concepts

### 1. Persisto Instance

The main entry point to the library is the `Persisto` instance. This object provides all the methods for interacting with the persistence layer, such as creating, reading, updating, and deleting objects. It is initialized with a storage strategy and a logger.

### 2. Storage Strategies

Persisto uses a strategy pattern to handle the actual storage of data. This means that the core logic of the library is decoupled from the underlying storage mechanism. The default strategy is `SimpleFSStorageStrategy`, which stores each object as a separate JSON file on the local file system. Other strategies can be implemented to support different storage backends, such as databases or in-memory stores.

### 3. Models and Types

Persisto is a schema-less persistence library, but it does have the concept of "types" or "models". These are used to group objects together and to define indexes and groupings. Types are defined by providing a configuration object to the `Persisto` instance.

### 4. CRUD Operations

Persisto provides standard CRUD (Create, Read, Update, Delete) operations for objects. These are exposed as methods on the `Persisto` instance, such as `create<TypeName>`, `get<TypeName>`, `update<TypeName>`, and `delete<TypeName>`.

### 5. Indexing

To efficiently retrieve objects, Persisto supports indexing on specific fields. When an index is created on a field, a new method is dynamically added to the `Persisto` instance to retrieve objects by that field. For example, if an index is created on the `email` field of the `user` type, a `getUserByEmail` method will be available.

### 6. Grouping

Persisto also supports grouping of objects based on a specific field. This is useful for retrieving all objects that have the same value for a particular field. For example, you could group users by their country.

### 7. Relationships

Persisto allows you to define relationships between different types of objects. This is useful for creating a graph of connected data. When a relationship is defined, methods are dynamically added to the `Persisto` instance to retrieve related objects.

### 8. Digital Assets

Persisto has built-in support for "digital assets", which are objects that have an associated value (e.g., a balance). These are similar to smart contracts or NFTs.

## Architecture

The project is divided into three main components:

1.  **Core Library (`Persisto.cjs`, `SimpleFSStorageStrategy.cjs`)**: This is the heart of the project, containing the main `Persisto` class and the default file system storage strategy.
2.  **Server (`persistoServer.cjs`)**: An HTTP server that exposes the `Persisto` API over the network.
3.  **Client (`PersistoClient.cjs`)**: A client library for communicating with the `persistoServer`.

This architecture allows for flexibility in how the library is used. It can be used as a standalone library in a single process, or as a separate persistence service that is accessed over the network.
