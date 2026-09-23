# Tribos BRouter: the upstream server image plus the Tribos profiles, a
# contiguous-US tile sync and an entrypoint that keeps the tiles fresh.
# Built and deployed by Fly.io from deploy/brouter/fly.toml — see
# docs/brouter-self-host-runbook.md.
FROM ghcr.io/abrensch/brouter:latest

# The Fly volume mounts root-owned and the upstream image runs as uid 1000.
# This container does one thing behind Fly's proxy, so it runs as root
# rather than adding a privilege-drop shim.
USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Named Tribos profiles next to the stock ones (custom uploads still work).
COPY routing-profiles/*.brf /profiles2/
COPY deploy/brouter/sync-segments.sh deploy/brouter/entrypoint.sh /app/
RUN chmod 755 /app/sync-segments.sh /app/entrypoint.sh

ENV SEGMENTSPATH=/segments4 \
    PROFILESPATH=/profiles2 \
    CUSTOMPROFILESPATH=/customprofiles \
    PORT=17777 \
    MAXTHREADS=4 \
    JAVA_OPTS="-Xmx1400M -Xms512M -DmaxRunningTime=60 -DuseRFCMimeType=false -DusePOSTRequests=false" \
    RESYNC_INTERVAL_S=604800

EXPOSE 17777
CMD ["/app/entrypoint.sh"]
