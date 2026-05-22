.PHONY: up down

up:
	docker compose up -d --build --force-recreate

down:
	docker compose down --rmi all --remove-orphans
