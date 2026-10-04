import { Text, type TextProps } from '@mantine/core';

/** A label ID like TL-0001, always in the numbers face. */
export function DisplayId({ value, ...props }: { value: string } & TextProps) {
  return (
    <Text component="span" ff="'Courier Prime', monospace" fw={700} {...props}>
      {value}
    </Text>
  );
}
