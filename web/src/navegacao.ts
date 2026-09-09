/**
 * Estrutura do menu lateral.
 *
 * O painel vai crescer para outros modulos. Para adicionar uma seção nova,
 * basta acrescentar um item nesta lista e tratar o `id` em App.tsx — a sidebar
 * se desenha a partir daqui e não precisa ser mexida.
 *
 * `emBreve: true` deixa o item visível e desabilitado, útil para anunciar um
 * módulo que ainda está sendo construído.
 */
export interface ItemDeMenu {
  id: string;
  label: string;
  emBreve?: boolean;
}

export interface GrupoDeMenu {
  /** Título do grupo. Vazio quando o grupo não precisa de rótulo. */
  titulo?: string;
  itens: ItemDeMenu[];
}

export const MENU: GrupoDeMenu[] = [
  {
    titulo: 'Módulos',
    itens: [{ id: 'eventos-presenciais', label: 'Eventos Presenciais' }],
  },
  {
    titulo: 'Ajustes',
    itens: [{ id: 'configuracao', label: 'Configuração' }],
  },
];

/** Todos os ids validos, para App.tsx não precisar repetir a lista. */
export const IDS_DE_SECAO = MENU.flatMap((grupo) =>
  grupo.itens.filter((item) => !item.emBreve).map((item) => item.id),
);
