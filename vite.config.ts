import { defineConfig, PluginOption } from "vite";
import { enterDevPlugin, enterProdPlugin } from 'vite-plugin-enter-dev';
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const plugins = [
    ...enterProdPlugin(),
  ];
  if (mode === 'development') {
    plugins.push(...enterDevPlugin());
  }
  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: plugins.filter(Boolean) as PluginOption[],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: '/',
    build: {
      outDir: 'dist',
      // Solo separamos las familias que el arranque ya necesita: así el navegador
      // las cachea por separado entre despliegues (un cambio de código deja de
      // invalidar todo el paquete). El resto se deja a Rollup para que las
      // librerías que solo usa una pantalla no entren al arranque.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return;
            if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react-runtime';
            if (id.includes('node_modules/@supabase/')) return 'supabase-client';
            if (id.includes('node_modules/react-router')) return 'router';
            if (id.includes('node_modules/@radix-ui/')) return 'ui-radix';
            if (id.includes('node_modules/lucide-react')) return 'icons';
            if (id.includes('node_modules/@tanstack/')) return 'query';
            return;
          },
        },
      },
      // Excel, PDF y gráficos se descargan al abrir su pantalla, no antes.
      modulePreload: {
        resolveDependencies: (_filename: string, deps: string[]) =>
          deps.filter((dep) => !/(xlsx|pdf|charts|CartesianChart)-/.test(dep)),
      },
    }
  };
});