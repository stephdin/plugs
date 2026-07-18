import { useRef, useState } from "react";
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
import { useLongPress } from "@mantine/hooks";

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

function PlugCard({ plug, onToggle }: { plug: Plug; onToggle: () => void }) {
  const longPressHandlers = useLongPress(
    () => {
      if (plug.host) window.open(`http://${plug.host}`, "_blank");
    },
    { threshold: 600, cancelOnMove: true },
  );

  return (
    <Card
      withBorder
      padding="md"
      radius="lg"
      opacity={plug.offline || plug.loading ? 0.6 : 1}
      shadow="lg"
    >
      <Group justify="space-between" align="center" wrap="nowrap">
        <div
          {...(plug.host ? longPressHandlers : {})}
          style={{
            flex: 1,
            minWidth: 0,
            cursor: "default",
          }}
        >
          <Stack gap={4}>
            <Text size="md" fw={600} truncate>
              {plug.name}
            </Text>

            {plug.description && (
              <Text size="xs" c="dimmed" truncate>
                {plug.description}
              </Text>
            )}

            <Text size="sm" c="dimmed" fw={600}>
              {statusText(plug)}
            </Text>
          </Stack>
        </div>

        {plug.loading || plug.toggling ? (
          <Loader size="sm" m="sm" color="white" />
        ) : plug.readOnly ? (
          <Badge color={plug.on ? "blue.8" : "grey"} variant="light" size="lg">
            {plug.on ? "An" : "Aus"}
          </Badge>
        ) : (
          <Switch
            size="md"
            withThumbIndicator={false}
            checked={plug.on}
            disabled={plug.offline}
            onChange={onToggle}
          />
        )}
      </Group>
    </Card>
  );
}

export default function App() {
  const { plugs, toggle } = usePlugsWebSocket();
  const [confirmTarget, setConfirmTarget] = useState<Pick<
    Plug,
    "id" | "name" | "on"
  > | null>(null);
  const confirmSnapshot = useRef<Pick<Plug, "id" | "name" | "on"> | null>(null);

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
                <PlugCard
                  key={p.id}
                  plug={p}
                  onToggle={() => {
                    if (p.confirm) {
                      const target = { id: p.id, name: p.name, on: p.on };
                      confirmSnapshot.current = target;
                      setConfirmTarget(target);
                    } else {
                      toggle(p.id);
                    }
                  }}
                />
              ))}
            </Stack>
          </Container>
        </ScrollArea>
      </AppShell.Main>

      <Modal
        opened={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={`${
          confirmTarget?.name ?? confirmSnapshot.current?.name ?? "Plug"
        } ${(confirmTarget?.on ?? confirmSnapshot.current?.on) ? "ausschalten" : "einschalten"}`}
        centered
      >
        <Text size="sm">
          Bist du sicher, dass du{" "}
          <strong>
            {confirmTarget?.name ?? confirmSnapshot.current?.name ?? "Plug"}
          </strong>{" "}
          {(confirmTarget?.on ?? confirmSnapshot.current?.on)
            ? "ausschalten"
            : "einschalten"}{" "}
          möchtest?
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setConfirmTarget(null)}>
            Abbrechen
          </Button>
          <Button
            color={
              (confirmTarget?.on ?? confirmSnapshot.current?.on)
                ? "red"
                : "blue"
            }
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
