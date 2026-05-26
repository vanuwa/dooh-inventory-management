.PHONY: up down rebuild-api rebuild-ui

up:
	docker compose up -d --build --force-recreate

down:
	docker compose down --rmi all --remove-orphans

rebuild-api:
	docker stop dooh-inventory-api || true
	docker rm dooh-inventory-api || true
	docker rmi dooh-inventory-api || true
	docker compose up -d --build api

rebuild-ui:
	docker stop dooh-inventory-ui || true
	docker rm dooh-inventory-ui || true
	docker rmi dooh-inventory-ui || true
	docker compose up -d --build ui
