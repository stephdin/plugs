import {
  ActionIcon,
  AppShell,
  Badge,
  Box,
  Card,
  Container,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { IconSettings } from "@tabler/icons-react";

import type { Plug } from "./types.ts";
import { usePlugsWebSocket } from "./ws.ts";

function statusText(p: Plug): string {
  if (p.loading) return "Lädt…";
  if (p.offline) return "Nicht erreichbar";
  if (p.on) return `${p.activeWatts.toFixed(1)} W`;
  return "Aus";
}

export default function App() {
  const { plugs, toggle } = usePlugsWebSocket();

  const totalWatts = plugs
    .filter((p) => p.on)
    .reduce((sum, p) => sum + p.activeWatts, 0);

  return (
    <AppShell header={{ height: 60 }} padding="sm">
      <AppShell.Header p="sm">
        <Group justify="space-between" wrap="nowrap" h="100%">
          {/* Left: live total power draw. */}
          <Box
            style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}
          >
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={600}>
                Σ
              </Text>
              <Text size="sm" fw={600}>
                {totalWatts.toFixed(0)} W
              </Text>
            </Group>
          </Box>

          {/* Center: title */}
          <Text size="lg" fw={700}>
            Plugs
          </Text>

          {/* Right: settings */}
          <Box style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
            <ActionIcon variant="subtle" color="gray" size="lg">
              <IconSettings size={20} />
            </ActionIcon>
          </Box>
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
                      <Group gap="xs" wrap="nowrap" align="center">
                        <Text size="md" fw={600} truncate>
                          {p.name}
                        </Text>
                        {/* {p.location && (
                          <Badge color="gray" variant="light" size="sm">
                            {p.location}
                          </Badge>
                        )} */}
                      </Group>
                      <Group gap="xs" wrap="nowrap">
                        <Text size="sm" c="dimmed">
                          {statusText(p)}
                        </Text>
                      </Group>
                      {p.description && (
                        <Text size="xs" c="dimmed" truncate>
                          {p.description}
                        </Text>
                      )}
                    </Stack>

                    {p.loading ? (
                      <Loader size="sm" m="sm" color="white" />
                    ) : p.readOnly ? (
                      <Badge
                        color={p.on ? "blue.8" : "gray"}
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
                        onChange={() => toggle(p.id)}
                      />
                    )}
                  </Group>
                </Card>
              ))}
            </Stack>
          </Container>
        </ScrollArea>
      </AppShell.Main>
    </AppShell>
  );
}
