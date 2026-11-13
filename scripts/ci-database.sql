-- Exclusivo del servicio efímero de CI. Nunca ejecutar sobre desarrollo.
CREATE ROLE p03_prueba LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD 'p03_ci_prueba_desechable';
CREATE ROLE p03_api_prueba LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD 'p03_ci_api_desechable';
CREATE DATABASE entrega_fiable_eventos_pedidos_test OWNER postgres;
REVOKE ALL ON DATABASE entrega_fiable_eventos_pedidos_test FROM PUBLIC;
GRANT CONNECT, CREATE ON DATABASE entrega_fiable_eventos_pedidos_test TO p03_prueba;
GRANT CONNECT ON DATABASE entrega_fiable_eventos_pedidos_test TO p03_api_prueba;
\connect entrega_fiable_eventos_pedidos_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
