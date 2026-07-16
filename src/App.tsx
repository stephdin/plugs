import { useState } from "react";
import {
  AppShell,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Switch,
  Text,
} from "@mantine/core";

import type { Plug } from "../shared/types.ts";
import { usePlugsWebSocket } from "./ws.ts";

function formatWatts(w: number): string {
  return Math.round(w).toLocaleString("de-DE");
}

function statusText(p: Plug): string {
  if (p.loading) return "Lädt…";
  if (p.offline) return "Nicht erreichbar";
  if (p.on) return `${formatWatts(p.activeWatts)} W`;
  return "Aus";
}

export default function App() {
  const { plugs, toggle } = usePlugsWebSocket();
  const [confirmTarget, setConfirmTarget] = useState<Pick<
    Plug,
    "id" | "name" | "on"
  > | null>(null);

  const totalWatts = plugs
    .filter((p) => p.on)
    .reduce((sum, p) => sum + p.activeWatts, 0);

  return (
    <AppShell header={{ height: 60 }} padding="sm">
      <AppShell.Header p="md">
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="lg" fw={700}>
            Zuhause
          </Text>

          <Text size="md" fw={600} truncate>
            Gesamt {formatWatts(totalWatts)} W
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <ScrollArea h="100%">
          <Container size="xs" p={0}>
            <Stack gap="sm">
              {plugs.map((p) => (
                <Card
                  key={p.id}
                  withBorder
                  padding="md"
                  radius="md"
                  opacity={p.offline || p.loading ? 0.6 : 1}
                >
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Text size="md" fw={600} truncate>
                        {p.name}
                      </Text>

                      {p.description && (
                        <Text size="xs" c="dimmed" truncate>
                          {p.description}
                        </Text>
                      )}

                      <Text size="sm" c="dimmed">
                        {statusText(p)}
                      </Text>
                    </Stack>

                    {p.loading ? (
                      <Loader size="sm" m="sm" color="white" />
                    ) : p.readOnly ? (
                      <Badge
                        color={p.on ? "blue.8" : "grey"}
                        variant="light"
                        size="lg"
                      >
                        {p.on ? "An" : "Aus"}
                      </Badge>
                    ) : (
                      <Switch
                        size="md"
                        checked={p.on}
                        disabled={p.offline}
                        onChange={() => {
                          if (p.confirm) {
                            setConfirmTarget({
                              id: p.id,
                              name: p.name,
                              on: p.on,
                            });
                          } else {
                            toggle(p.id);
                          }
                        }}
                      />
                    )}
                  </Group>
                </Card>
              ))}
            </Stack>
          </Container>
        </ScrollArea>
      </AppShell.Main>

      <Modal
        opened={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={`${confirmTarget?.name ?? "Plug"} ${confirmTarget?.on ? "ausschalten" : "einschalten"}`}
        centered
      >
        <Text size="sm">
          Bist du sicher, dass du{" "}
          <strong>{confirmTarget?.name ?? "Plug"}</strong>{" "}
          {confirmTarget?.on ? "ausschalten" : "einschalten"} möchtest?
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setConfirmTarget(null)}>
            Abbrechen
          </Button>
          <Button
            color={confirmTarget?.on ? "red" : "blue"}
            onClick={() => {
              if (confirmTarget) toggle(confirmTarget.id);
              setConfirmTarget(null);
            }}
          >
            Bestätigen
          </Button>
        </Group>
      </Modal>
    </AppShell>
  );
}
