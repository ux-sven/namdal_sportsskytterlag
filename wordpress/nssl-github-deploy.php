<?php
/**
 * Plugin Name: NSSL – publiser til GitHub Pages
 * Description: Starter ny bygging av den offentlige nettsiden på GitHub når innlegg eller sider publiseres, endres eller slettes.
 * Version: 1.0.0
 *
 * Installering:
 *   1. Legg fila i wp-content/mu-plugins/ (lag mappa hvis den ikke finnes).
 *   2. Legg til i wp-config.php:
 *        define('NSSL_GITHUB_REPO', 'ux-sven/namdal_sportsskytterlag');
 *        define('NSSL_GITHUB_TOKEN', 'github_pat_...'); // fine-grained token, kun dette repoet, Contents: Read and write
 */

if (!defined('ABSPATH')) {
    exit;
}

/** Samle endringer i ett minutt før bygging startes, så flere lagringer gir én bygging. */
function nssl_schedule_build() {
    if (!wp_next_scheduled('nssl_github_build')) {
        wp_schedule_single_event(time() + 60, 'nssl_github_build');
    }
}

add_action('transition_post_status', function ($new_status, $old_status, $post) {
    if (!in_array($post->post_type, ['post', 'page'], true)) {
        return;
    }
    if (wp_is_post_revision($post) || wp_is_post_autosave($post)) {
        return;
    }
    if ($new_status === 'publish' || $old_status === 'publish') {
        nssl_schedule_build();
    }
}, 10, 3);

add_action('nssl_github_build', function () {
    if (!defined('NSSL_GITHUB_TOKEN') || !defined('NSSL_GITHUB_REPO')) {
        return;
    }
    $response = wp_remote_post('https://api.github.com/repos/' . NSSL_GITHUB_REPO . '/dispatches', [
        'timeout' => 10,
        'headers' => [
            'Authorization'        => 'Bearer ' . NSSL_GITHUB_TOKEN,
            'Accept'               => 'application/vnd.github+json',
            'X-GitHub-Api-Version' => '2022-11-28',
            'User-Agent'           => 'nssl-wordpress',
        ],
        'body' => wp_json_encode(['event_type' => 'wordpress-publish']),
    ]);
    $code = is_wp_error($response) ? $response->get_error_message() : wp_remote_retrieve_response_code($response);
    update_option('nssl_github_last_build', ['time' => current_time('mysql'), 'result' => $code], false);
});

/** Liten statuslinje på kontrollpanelet, så redaktørene ser at publiseringen virker. */
add_action('admin_notices', function () {
    $screen = function_exists('get_current_screen') ? get_current_screen() : null;
    if (!$screen || $screen->id !== 'dashboard') {
        return;
    }
    $last = get_option('nssl_github_last_build');
    if (!$last) {
        return;
    }
    $ok = (string) $last['result'] === '204';
    printf(
        '<div class="notice notice-%s"><p>Nettsiden ble sist bedt om å oppdatere seg %s (%s). Endringer vises på nettsiden etter 1–2 minutter.</p></div>',
        $ok ? 'success' : 'warning',
        esc_html($last['time']),
        $ok ? 'OK' : 'feil: ' . esc_html($last['result'])
    );
});
