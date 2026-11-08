FROM caddy:2
COPY out/ /srv/
COPY Caddyfile.pod /etc/caddy/Caddyfile
USER 65532:65532
EXPOSE 8080
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
